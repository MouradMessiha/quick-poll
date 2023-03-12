import { DefineFunction, SlackFunction } from "deno-slack-sdk/mod.ts";

export const ScheduledCleanup = DefineFunction({
  callback_id: "scheduled_cleanup",
  title: "Datastore cleanup",
  description: "Cleanup all closed polls from datastore",
  source_file: "functions/scheduledCleanup.ts",
  input_parameters: {
    properties: {},
    required: [],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

export default SlackFunction(
  ScheduledCleanup,
  async ({ client }) => {
    console.log("Start of daily datastore cleanup");

    const closedVotesresponse = await client.apps.datastore.query({
      datastore: "vote_header",
      expression: "#is_vote_closed = :is_true",
      expression_attributes: { "#is_vote_closed": "is_vote_closed" },
      expression_values: { ":is_true": true },
    });
    if (closedVotesresponse.ok) {
      const closedVotes = closedVotesresponse.items;
      for (const closedVote of closedVotes) {
        const uuid = closedVote.id;
        console.log("Cleaning up closed vote with id " + uuid);
        // delete all the vote details
        const responseAllVoteDetails = await client.apps.datastore.query({
          datastore: "vote_detail",
          expression: "#vote_id = :search_id",
          expression_attributes: { "#vote_id": "vote_id" },
          expression_values: { ":search_id": uuid },
        });
        if (responseAllVoteDetails.ok) {
          const AllVoteDetails = responseAllVoteDetails.items;
          for (const voteDetail of AllVoteDetails) {
            const voteDetailID = voteDetail.id;
            const responseVoteDelete = await client.apps.datastore.delete({
              datastore: "vote_detail",
              id: voteDetailID,
            });
            if (responseVoteDelete.ok) {
              console.log("Deleted vote detail record with id " + voteDetailID);
            } else {
              console.log(
                "Error deleting vote detail record with id " + voteDetailID +
                  ": " + responseVoteDelete.error,
              );
            }
          }
        } else {
          console.log(
            "Error querying detail records for vote id " + uuid + ": " +
              responseAllVoteDetails.error,
          );
        }

        // Delete the header record
        const responseHeaderDelete = await client.apps.datastore.delete({
          datastore: "vote_header",
          id: uuid,
        });
        if (responseHeaderDelete.ok) {
          console.log("Deleted header record for vote id " + uuid);
        } else {
          console.log(
            "Error deleting header record for vote id " + uuid + ": " +
              responseHeaderDelete.error,
          );
        }
      }
    } else {
      console.log(
        "Error querying closed votes: " + closedVotesresponse.error,
      );
    }

    console.log("End of daily datastore cleanup");
    return { outputs: {} };
  },
);
