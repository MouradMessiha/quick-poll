import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { closeVote } from "./utils/utils.ts";

export const ScheduledClose = DefineFunction({
  callback_id: "scheduled_close_poll",
  title: "Close poll",
  description: "Close a poll from a scheduled trigger",
  source_file: "functions/scheduledClose.ts",
  input_parameters: {
    properties: {
      pollinputs: {
        type: Schema.types.object,
      },
      message_ts: {
        type: Schema.types.string,
      },
    },
    required: ["pollinputs", "message_ts"],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export default SlackFunction(
  ScheduledClose,
  async ({ client, inputs }) => {
    console.log(
      `End time reached for poll titled (${inputs.pollinputs.title})`,
    );

    await closeVote(client, inputs.pollinputs, inputs.message_ts);

    return { outputs: {} };
  },
);
