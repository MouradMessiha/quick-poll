import { Manifest } from "deno-slack-sdk/mod.ts";
import PollWorkflow from "./workflows/poll_workflow.ts";
import ScheduledCloseWorkflow from "./workflows/scheduledClose.ts";
import {
  GlobalSettingsDatastore,
  VoteDetailDatastore,
  VoteHeaderDatastore,
} from "./datastores/main.ts";
import { CreatePoll } from "./functions/create_poll.ts";
import { PollFunction } from "./functions/poll.ts";
import { ScheduledClose } from "./functions/scheduledClose.ts";
import { ScheduledCleanup } from "./functions/scheduledCleanup.ts";
import ScheduledCleanupWorkflow from "./workflows/scheduledCleanup.ts";

export default Manifest({
  name: "Polls",
  description: "An app that handles polls in Slack channels",
  icon: "assets/default_new_app_icon.png",
  workflows: [PollWorkflow, ScheduledCloseWorkflow, ScheduledCleanupWorkflow],
  functions: [CreatePoll, PollFunction, ScheduledClose, ScheduledCleanup],
  outgoingDomains: [],
  datastores: [
    VoteHeaderDatastore,
    VoteDetailDatastore,
    GlobalSettingsDatastore,
  ],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
    "triggers:write",
    "chat:write.customize",
  ],
});
