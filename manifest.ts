import { Manifest } from "deno-slack-sdk/mod.ts";
import PollWorkflow from "./workflows/poll_workflow.ts";
import ScheduledCloseWorkflow from "./workflows/scheduledClose.ts";
import { VoteHeaderDatastore } from "./datastores/main.ts";
// import { VoteItemDatastore } from "./datastores/main.ts";
// import { UserVoteDatastore } from "./datastores/main.ts";
import { VoteDetailDatastore } from "./datastores/main.ts";
import { CreatePoll } from "./functions/create_poll.ts";
import { PollFunction } from "./functions/poll.ts";
import { ScheduledClose } from "./functions/scheduledClose.ts";

export default Manifest({
  name: "Polls",
  description: "An app that handles polls in Slack channels",
  icon: "assets/default_new_app_icon.png",
  workflows: [PollWorkflow, ScheduledCloseWorkflow],
  functions: [CreatePoll, PollFunction, ScheduledClose],
  outgoingDomains: [],
  datastores: [VoteHeaderDatastore, VoteDetailDatastore],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
    "triggers:write",
  ],
});
