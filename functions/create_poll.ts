import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { getEmoji } from "./utils/utils.ts";

export const CreatePoll = DefineFunction({
  callback_id: "create_poll",
  title: "Create a poll",
  description: "Create a poll in the channel",
  source_file: "functions/create_poll.ts",
  input_parameters: {
    properties: {
      interactivity: { // This tells Slack that your function will create interactive elements
        type: Schema.slack.types.interactivity,
      },
      creator_user_id: {
        type: Schema.slack.types.user_id,
      },
    },
    required: ["interactivity", "creator_user_id"],
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
    },
    required: ["uuid", "title", "options"],
  },
});

export default SlackFunction(
  CreatePoll,
  async ({ inputs, client }) => {
    await client.views.open({
      interactivity_pointer: inputs.interactivity.interactivity_pointer,
      view: viewObject({ "values": {} }),
    });
    return {
      completed: false,
    };
  },
).addViewSubmissionHandler(
  "create_poll_view",
  async ({ inputs, client, body, view }) => {
    const title = view.state.values.topic["topic"].value
      .trim();
    const options: string[] = view.state.values.options["options"].value
      .split("\n")
      .map((option: string) => option.trim())
      .filter((option: string) => option !== "")
      .map((option: string, index: number) =>
        getEmoji(index + 1) + " " + option
      );
    // deno-lint-ignore no-explicit-any
    const errors: any = {};
    let hasErrors = false;
    if (!title) {
      errors.description = "Please enter a topic";
      hasErrors = true;
    }
    if (options.length > 46) {
      errors.options = "Too many items, 46 is the max";
      hasErrors = true;
    }
    if (options.length === 0) {
      errors.options = "Please enter at least one option";
      hasErrors = true;
    }
    if (hasErrors) {
      return {
        response_action: "errors",
        errors: errors,
      };
    }
    const uuid = inputs.creator_user_id + Date.now();

    await client.apps.datastore.put({
      datastore: "vote_header",
      item: {
        id: uuid,
        is_vote_closed: false,
      },
    });

    const outputs = {
      uuid,
      title,
      options,
    };
    await client.functions.completeSuccess({
      function_execution_id: body.function_data.execution_id,
      outputs,
    });
  },
).addBlockActionsHandler(
  "menu_selection",
  async ({ body, client }) => {
    await client.views.update({
      interactivity_pointer: body.interactivity.interactivity_pointer,
      view_id: body.view.id,
      view: viewObject(body.view.state),
    });
  },
);

// deno-lint-ignore no-explicit-any
function viewObject(state: any) {
  const blocks = [];
  blocks.push(multiline_input("topic", "topic", "Topic"));
  blocks.push(multiline_input("options", "options", "Options (one per line)"));
  blocks.push(
    multi_buttons_input(
      "names_visibility_during",
      "menu_selection",
      "Names visibility during the poll",
      "Everyone",
      "everyone",
      [
        { text: "Everyone", value: "everyone" },
        { text: "Only me", value: "only_me" },
        { text: "No one", value: "no_one" },
      ],
    ),
  );
  if (
    state.values.names_visibility_during &&
    state.values.names_visibility_during.menu_selection.selected_option
        .value ===
      "only_me"
  ) {
    blocks.push(
      multi_buttons_input(
        "names_visibility_after",
        "menu_selection",
        "Names visibility after the poll is closed",
        "Everyone",
        "everyone",
        [
          { text: "Everyone", value: "everyone" },
          { text: "Only me", value: "only_me" },
          { text: "No one", value: "no_one" },
        ],
      ),
    );
  }

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
      "emoji": true,
    },
  };
}

function multi_buttons_input(
  block_id: string,
  action_id: string,
  label: string,
  selected_text: string,
  selected_value: string,
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
      "text": label,
    },
    "accessory": {
      "type": "static_select",
      "placeholder": {
        "type": "plain_text",
        "text": "Select an item",
        "emoji": true,
      },
      "options": options.map((option) => {
        return {
          "text": {
            "type": "plain_text",
            "text": option.text,
            "emoji": true,
          },
          "value": option.value,
        };
      }),
      "action_id": action_id,
      "initial_option": {
        "text": {
          "type": "plain_text",
          "text": selected_text,
          "emoji": true,
        },
        "value": selected_value,
      },
    },
  };
}
