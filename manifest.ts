import { Manifest } from "deno-slack-sdk/mod.ts";
import PollWorkflow from "./workflows/poll_workflow.ts";
import { VoteHeaderDatastore } from "./datastores/main.ts";
// import { VoteItemDatastore } from "./datastores/main.ts";
// import { UserVoteDatastore } from "./datastores/main.ts";
import { VoteDetailDatastore } from "./datastores/main.ts";

export default Manifest({
  name: "my-app",
  description:
    "A sample that demonstrates using a function, workflow and trigger to send a greeting",
  icon: "assets/default_new_app_icon.png",
  workflows: [PollWorkflow],
  outgoingDomains: [],
  datastores: [VoteHeaderDatastore, VoteDetailDatastore],
  botScopes: [
    "commands",
    "chat:write",
    "chat:write.public",
    "datastore:read",
    "datastore:write",
  ],
});
