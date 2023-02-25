import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { PollFunction } from "../functions/poll.ts";

const PollWorkflow = DefineWorkflow({
  callback_id: "poll_workflow",
  title: "Send a greeting",
  description: "Send a greeting to channel",
  input_parameters: {
    properties: {
      interactivity: {
        type: Schema.slack.types.interactivity,
      },
      channel: {
        type: Schema.slack.types.channel_id,
      },
      creator_user_id: {
        type: Schema.slack.types.user_id,
      },
    },
    required: ["interactivity", "channel", "creator_user_id"],
  },
});

PollWorkflow.addStep(
  PollFunction,
  {
    interactivity: PollWorkflow.inputs.interactivity,
    channel_id: PollWorkflow.inputs.channel,
    creator_user_id: PollWorkflow.inputs.creator_user_id,
  },
);

export default PollWorkflow;
