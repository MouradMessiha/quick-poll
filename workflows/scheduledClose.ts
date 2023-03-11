import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ScheduledClose } from "../functions/scheduledClose.ts";

const ScheduledCloseWorkflow = DefineWorkflow({
  callback_id: "scheduled_close_workflow",
  title: "Close poll",
  description: "Close poll from a scheduled trigger",
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
});

ScheduledCloseWorkflow.addStep(
  ScheduledClose,
  {
    pollinputs: ScheduledCloseWorkflow.inputs.pollinputs,
    message_ts: ScheduledCloseWorkflow.inputs.message_ts,
  },
);

export default ScheduledCloseWorkflow;
