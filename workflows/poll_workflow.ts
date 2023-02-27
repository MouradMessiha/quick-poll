import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { PollFunction } from "../functions/poll.ts";
import { CreatePoll } from "../functions/create_poll.ts";

const PollWorkflow = DefineWorkflow({
  callback_id: "poll_workflow",
  title: "Poll Workflow",
  description: "Create a poll in the channel",
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

const { outputs } = PollWorkflow.addStep(
  CreatePoll,
  {
    interactivity: PollWorkflow.inputs.interactivity,
    creator_user_id: PollWorkflow.inputs.creator_user_id,
  },
);

PollWorkflow.addStep(
  PollFunction,
  {
    channel_id: PollWorkflow.inputs.channel,
    creator_user_id: PollWorkflow.inputs.creator_user_id,
    uuid: outputs.uuid,
    title: outputs.title,
    options: outputs.options,
  },
);

export default PollWorkflow;
