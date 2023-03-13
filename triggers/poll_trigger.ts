import { Trigger } from "deno-slack-api/types.ts";
import PollWorkflow from "../workflows/poll_workflow.ts";

/*
 * This trigger is called by a shortcut to start a new poll.
 */
const pollTrigger: Trigger<typeof PollWorkflow.definition> = {
  type: "shortcut",
  name: "start a poll",
  description: "Start a poll in the channel",
  workflow: "#/workflows/poll_workflow",
  inputs: {
    interactivity: {
      value: "{{data.interactivity}}",
    },
    channel: {
      value: "{{data.channel_id}}",
    },
    creator_user_id: {
      value: "{{data.user_id}}",
    },
  },
};

export default pollTrigger;
