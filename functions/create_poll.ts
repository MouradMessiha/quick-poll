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
      view: {
        "type": "modal",
        "title": {
          "type": "plain_text",
          "text": "Create a poll",
          "emoji": true,
        },
        "submit": {
          "type": "plain_text",
          "text": "Submit",
          "emoji": true,
        },
        "close": {
          "type": "plain_text",
          "text": "Cancel",
          "emoji": true,
        },
        "callback_id": "create_poll_view",
        "blocks": [
          {
            "type": "input",
            "block_id": "description",
            "element": {
              "type": "plain_text_input",
              "multiline": true,
              "action_id": "description-action",
            },
            "label": {
              "type": "plain_text",
              "text": "Topic",
              "emoji": true,
            },
          },
          {
            "type": "input",
            "block_id": "options",
            "element": {
              "type": "plain_text_input",
              "multiline": true,
              "action_id": "options-action",
            },
            "label": {
              "type": "plain_text",
              "text": "Options (one per line)",
              "emoji": true,
            },
          },
        ],
      },
    });
    return {
      completed: false,
    };
  },
).addViewSubmissionHandler(
  "create_poll_view",
  async ({ inputs, client, body, view }) => {
    const title = view.state.values.description["description-action"].value
      .trim();
    const options: string[] = view.state.values.options["options-action"].value
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
);
