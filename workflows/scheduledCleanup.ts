import { DefineWorkflow } from "deno-slack-sdk/mod.ts";
import { ScheduledCleanup } from "../functions/scheduledCleanup.ts";

const ScheduledCleanupWorkflow = DefineWorkflow({
  callback_id: "scheduled_cleanup_workflow",
  title: "Cleanup closed polls",
  description: "Cleanup all closed polls from datastore",
  input_parameters: {
    properties: {},
    required: [],
  },
});

ScheduledCleanupWorkflow.addStep(
  ScheduledCleanup,
  {},
);

export default ScheduledCleanupWorkflow;
