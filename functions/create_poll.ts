import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { getEmoji } from "./utils/utils.ts";
import {
  EVERYONE,
  LIMITED,
  NO_ONE,
  ONLY_ME,
  UNLIMITED,
} from "./utils/utils.ts";

/*
 * This function is used to create a poll in the channel
 * It opens a view to collect the poll details
 * It then returns the poll details to the poll function
 * The poll function then creates the poll
 */
export const CreatePoll = DefineFunction({
  callback_id: "create_poll",
  title: "Create a poll",
  description: "Create a poll in the channel",
  source_file: "functions/create_poll.ts",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
      },
      interactivity: { // This tells Slack that your function will create interactive elements
        type: Schema.slack.types.interactivity,
      },
      creator_user_id: {
        type: Schema.slack.types.user_id,
      },
    },
    required: ["channel_id", "interactivity", "creator_user_id"],
  },
  output_parameters: {
    properties: {
      uuid: {
        type: Schema.types.string,
      },
      title: {
        type: Schema.types.string,
      },
      options: {
        type: Schema.types.array,
        items: {
          type: Schema.types.string,
        },
      },
      channel_id: {
        type: Schema.types.string,
      },
      names_visibility_during: {
        type: Schema.types.string,
      },
      names_visibility_after: {
        type: Schema.types.string,
      },
      counts_visibility_during: {
        type: Schema.types.string,
      },
      counts_visibility_after: {
        type: Schema.types.string,
      },
      max_votes_per_user: {
        type: Schema.types.number,
      },
      end_date_time: {
        type: Schema.types.number,
      },
    },
    required: [
      "uuid",
      "title",
      "options",
      "channel_id",
      "names_visibility_during",
      "names_visibility_after",
      "counts_visibility_during",
      "counts_visibility_after",
      "max_votes_per_user",
      "end_date_time",
    ],
  },
});

export default SlackFunction(
  CreatePoll,
  async ({ inputs, client }) => {
    await client.views.open({
      interactivity_pointer: inputs.interactivity.interactivity_pointer,
      view: viewObject({ "values": {} }, inputs.channel_id), // initial view with empty state
    });
    return {
      completed: false,
    };
  },
).addViewSubmissionHandler(
  "create_poll_view",
  async ({ inputs, client, body, view }) => {
    /*
     * This is the handler for when the user submits the modal
     */
    const title = view.state.values.topic.topic.value
      .trim();
    const options: string[] = view.state.values.options.options.value
      .split("\n")
      .map((option: string) => option.trim())
      .filter((option: string) => option !== "")
      .map((option: string, index: number) =>
        getEmoji(index + 1) + " " + option
      );
    const channel_id = view.state.values.channel?.value?.selected_channel;
    const names_visibility_during =
      view.state.values.names_visibility_during?.visibility_selection
        ?.selected_option?.value || EVERYONE;
    const names_visibility_after =
      view.state.values.names_visibility_after?.visibility_selection
        ?.selected_option?.value || EVERYONE;
    const counts_visibility_during = view.state.values.counts_visibility_during
      ?.visibility_selection?.selected_option?.value || EVERYONE;
    const counts_visibility_after = view.state.values.counts_visibility_after
      ?.visibility_selection?.selected_option?.value || EVERYONE;
    const max_votes_per_user =
      view.state.values.max_votes_per_user?.value?.value || 0;
    const exact_end_date_time =
      view.state.values.end_date_time?.value?.selected_date_time ||
      0;
    const end_date_time = exact_end_date_time - (exact_end_date_time % 60);

    // validate the inputs
    // deno-lint-ignore no-explicit-any
    const errors: any = {};
    let hasErrors = false;
    if (!title) {
      errors.title = "Please enter a topic";
      hasErrors = true;
    }
    if (options.length > 46) {
      errors.options = "Too many options, 46 is the max";
      hasErrors = true;
    }
    if (options.length === 0) {
      errors.options = "Please enter at least one option";
      hasErrors = true;
    }

    const min_date_time = Math.floor(Date.now() / 1000) + 30; // 30 seconds from now
    if (end_date_time < min_date_time) {
      errors.end_date_time = "Poll end date and time must be in the future";
      hasErrors = true;
    }
    // prevent submission with invalid inputs
    if (hasErrors) {
      return {
        response_action: "errors",
        errors: errors,
      };
    }

    // create a unique id for the poll
    const uuid = inputs.creator_user_id + Date.now();

    // create the poll header record in the datastore
    await client.apps.datastore.put({
      datastore: "vote_header",
      item: {
        id: uuid,
        is_vote_closed: false,
        trigger_id: "",
      },
    });

    // pass the poll data to the next function
    const outputs = {
      uuid,
      title,
      options,
      channel_id,
      names_visibility_during,
      names_visibility_after,
      counts_visibility_during,
      counts_visibility_after,
      max_votes_per_user,
      end_date_time,
    };

    await client.functions.completeSuccess({
      function_execution_id: body.function_data.execution_id,
      outputs,
    });
  },
).addBlockActionsHandler(
  "visibility_selection",
  async ({ body, client, inputs }) => {
    // handler to dynamically update the view based on which results visiblity options were selected
    await client.views.update({
      interactivity_pointer: body.interactivity.interactivity_pointer,
      view_id: body.view.id,
      view: viewObject(body.view.state, inputs.channel_id),
    });
  },
).addBlockActionsHandler(
  "vote_limit_selection",
  async ({ body, client, inputs }) => {
    // hamdler to dynamically update the view based on which voting limits options were selected
    await client.views.update({
      interactivity_pointer: body.interactivity.interactivity_pointer,
      view_id: body.view.id,
      view: viewObject(body.view.state, inputs.channel_id),
    });
  },
);

/*
 * Compose the modal view based on the current state of the inputs
 */
// deno-lint-ignore no-explicit-any
function viewObject(state: any, channel: string) {
  const blocks = [];
  // poll title
  blocks.push(multiline_input("topic", "topic", "Topic"));
  // poll items
  blocks.push(multiline_input("options", "options", "Options (one per line)"));
  // channel for the poll
  blocks.push({
    "type": "input",
    "block_id": "channel",
    "label": {
      "type": "plain_text",
      "text": "Channel",
    },
    "element": {
      "type": "channels_select",
      "action_id": "value",
      "initial_channel": channel,
    },
  });
  // options for results visiblity during the poll
  blocks.push(
    menu_select(
      "names_visibility_during",
      "visibility_selection",
      "Names visibile during the poll to",
      { text: "Everyone", value: EVERYONE },
      [
        { text: "Everyone", value: EVERYONE },
        { text: "Only me", value: ONLY_ME },
        { text: "No one", value: NO_ONE },
      ],
    ),
  );
  const names_visibility_during =
    state.values.names_visibility_during?.visibility_selection?.selected_option
      ?.value || EVERYONE;
  if (
    names_visibility_during === ONLY_ME ||
    names_visibility_during === NO_ONE
  ) {
    const valid_options = [
      { text: "Everyone", value: EVERYONE },
      { text: "Only me", value: ONLY_ME },
    ];
    if (names_visibility_during === NO_ONE) {
      valid_options.push({ text: "No one", value: NO_ONE });
    }

    blocks.push(
      menu_select(
        "names_visibility_after",
        "visibility_selection",
        "Names visibile after the poll is closed to",
        { text: "Everyone", value: EVERYONE },
        valid_options,
      ),
    );

    blocks.push(
      menu_select(
        "counts_visibility_during",
        "visibility_selection",
        "Vote counts visibile during the poll to",
        { text: "Everyone", value: EVERYONE },
        valid_options,
      ),
    );
    const counts_visibility_during =
      state.values.counts_visibility_during?.visibility_selection
        ?.selected_option
        ?.value || EVERYONE;
    if (
      counts_visibility_during === ONLY_ME ||
      counts_visibility_during === NO_ONE
    ) {
      blocks.push(
        menu_select(
          "counts_visibility_after",
          "visibility_selection",
          "Vote counts visibile after the poll is closed to",
          { text: "Everyone", value: EVERYONE },
          [
            { text: "Everyone", value: EVERYONE },
            { text: "Only me", value: ONLY_ME },
          ],
        ),
      );
    }
  }

  // option for voting limits
  blocks.push(
    menu_select(
      "votes_per_user",
      "vote_limit_selection",
      "Votes per user",
      { text: "Unlimited", value: UNLIMITED },
      [
        { text: "Unlimited", value: UNLIMITED },
        { text: "Limited", value: LIMITED },
      ],
    ),
  );
  const votes_per_user =
    state.values.votes_per_user?.vote_limit_selection?.selected_option?.value ||
    UNLIMITED;
  // if the voting limit is limited, add a field to enter the limit
  if (votes_per_user === LIMITED) {
    blocks.push({
      "type": "input",
      "block_id": "max_votes_per_user",
      "element": {
        "type": "number_input",
        "is_decimal_allowed": false,
        "initial_value": "1",
        "min_value": "1",
        "action_id": "value",
      },
      "label": {
        "type": "plain_text",
        "text": "Max votes per user",
      },
    });
  }
  // poll end date and time
  blocks.push({
    "type": "input",
    "block_id": "end_date_time",
    "element": {
      "type": "datetimepicker",
      "action_id": "value",
      "initial_date_time": Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    },
    "label": {
      "type": "plain_text",
      "text": "Poll end date and time",
    },
  });
  // return the view object
  return {
    "type": "modal",
    "title": {
      "type": "plain_text",
      "text": "Create a poll",
    },
    "submit": {
      "type": "plain_text",
      "text": "Submit",
    },
    "close": {
      "type": "plain_text",
      "text": "Cancel",
    },
    "callback_id": "create_poll_view",
    "blocks": blocks,
  };
}

// helper function to create block for multiline input
function multiline_input(
  block_id: string,
  action_id: string,
  label: string,
) {
  return {
    "type": "input",
    "block_id": block_id,
    "element": {
      "type": "plain_text_input",
      "multiline": true,
      "action_id": action_id,
    },
    "label": {
      "type": "plain_text",
      "text": label,
    },
  };
}

// helper function to create block for a dropdown menu
function menu_select(
  block_id: string,
  action_id: string,
  label: string,
  initial_option: {
    text: string;
    value: string;
  },
  options: {
    text: string;
    value: string;
  }[],
) {
  return {
    "type": "section",
    "block_id": block_id,
    "text": {
      "type": "mrkdwn",
      "text": `*${label}*`,
    },
    "accessory": {
      "type": "static_select",
      "action_id": action_id,
      "initial_option": menu_option(initial_option.text, initial_option.value),
      "options": options.map(
        (option) => (menu_option(option.text, option.value)),
      ),
    },
  };
}

// helper function to create an option in a drop down menu
function menu_option(text: string, value: string) {
  return {
    "text": {
      "type": "plain_text",
      "text": text,
    },
    "value": value,
  };
}
