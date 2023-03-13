import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { EVERYONE, NO_ONE, ONLY_ME } from "./utils/utils.ts";
import { getEmoji } from "./utils/utils.ts";
import { closeVote } from "./utils/utils.ts";
import { isPollClosed } from "./utils/utils.ts";
import { voteStatistics } from "./utils/utils.ts";
import { messageBlocks } from "./utils/utils.ts";
import { resultsBlocks } from "./utils/utils.ts";
import ScheduledCloseWorkflow from "../workflows/scheduledClose.ts";

export const PollFunction = DefineFunction({
  callback_id: "poll_function",
  title: "Handle a poll",
  description: "Handle a poll in the channel",
  source_file: "functions/poll.ts",
  input_parameters: {
    properties: {
      creator_user_id: {
        type: Schema.slack.types.user_id,
      },
      uuid: {
        type: Schema.types.string,
      },
      title: {
        type: Schema.types.string,
      },
      options: {
        type: Schema.types.array,
        items: {
          type: Schema.types.string,
        },
      },
      channel_id: {
        type: Schema.types.string,
      },
      names_visibility_during: {
        type: Schema.types.string,
      },
      names_visibility_after: {
        type: Schema.types.string,
      },
      counts_visibility_during: {
        type: Schema.types.string,
      },
      counts_visibility_after: {
        type: Schema.types.string,
      },
      max_votes_per_user: {
        type: Schema.types.number,
      },
      end_date_time: {
        type: Schema.types.number,
      },
    },
    required: [
      "creator_user_id",
      "uuid",
      "title",
      "options",
      "channel_id",
      "names_visibility_during",
      "names_visibility_after",
      "counts_visibility_during",
      "counts_visibility_after",
      "max_votes_per_user",
      "end_date_time",
    ],
  },
  output_parameters: {
    properties: {},
    required: [],
  },
});

/*
  Function to handle the poll after it has been created
*/
export default SlackFunction(
  PollFunction,
  async ({ inputs, client }) => {
    // post the poll message based on the inputs from the modal
    const blocks = messageBlocks(inputs, {}, false);
    const messageResponse = await client.chat.postMessage({
      channel: inputs.channel_id,
      blocks: blocks,
      unfurl_links: false,
      unfurl_media: false,
      icon_emoji: ":ballot_box_with_ballot:",
      metadata: {
        event_type: "quick_poll",
        event_payload: {
          isPollClosed: false,
        },
      },
    });
    // create a trigger to close the poll on the end datetime
    const triggerResponse = await client.workflows.triggers.create({
      name: "scheduled_close",
      type: "scheduled",
      workflow: `#/workflows/${ScheduledCloseWorkflow.definition.callback_id}`,
      inputs: {
        pollinputs: { value: inputs },
        message_ts: { value: messageResponse.ts },
      },
      schedule: {
        start_time: (new Date(inputs.end_date_time * 1000)).toISOString(),
        timezone: "UTC",
        frequency: {
          type: "once",
        },
      },
    });

    // add trigger_id to datastore (used to delete the trigger when the poll is closed)
    if (triggerResponse.ok) {
      await client.apps.datastore.put({
        datastore: "vote_header",
        item: {
          id: inputs.uuid,
          is_vote_closed: false,
          trigger_id: triggerResponse.trigger?.id || "",
        },
      });
    } else {
      console.log(
        `Error creating trigger for poll titled (${inputs.title}): ${triggerResponse.error}`,
      );
    }

    return {
      completed: false,
    };
  },
).addBlockActionsHandler(
  /toggle_.*/,
  async ({ body, action, inputs, client }) => {
    // Handler for when the user clicks on the button next to a  vote button in the message
    // The message can be updated without changing the metadata, so a race condition can re-display the buttons while the poll is closed
    const isVoteClosed = body.message?.metadata?.event_payload?.isPollClosed;
    if (isVoteClosed) {
      // recover from this state by updating the message again to the closed state
      const statistics = body.message?.metadata?.event_payload?.statistics;
      const blocks = messageBlocks(
        inputs,
        statistics,
        isVoteClosed,
      );

      await client.chat.update({
        channel: inputs.channel_id,
        ts: body.container.message_ts,
        blocks: blocks,
      });
      return;
    }
    // index of the vote button that was clicked
    const item_index = Number(action.action_id.replace("toggle_", ""));
    // text of the vote item that was clicked
    const item_text: string = inputs.options[item_index - 1];
    // hash the user_id to group votes into at most 50 datastore records (to minimize a chance of a concurrent update to same record)
    const user_hash = hashUserID(body.user.id);

    // get the current votes for all users sharing this same hash number
    const responseHashVotes = await client.apps.datastore.get({
      datastore: "vote_detail",
      id: inputs.uuid + "_" + user_hash,
    });
    if (responseHashVotes.ok) {
      let confirmationMessage = "";
      const hashVotes = responseHashVotes.item.user_ids || "";
      const didVote = didUserVote(hashVotes, body.user.id, item_index);
      let newHashVotes = "";
      if (didVote) {
        newHashVotes = removeVote(hashVotes, body.user.id, item_index);
        confirmationMessage = "Vote removed for: " + item_text;
      } else {
        newHashVotes = addVote(hashVotes, body.user.id, item_index);
        const maxVotes = inputs.max_votes_per_user;
        if (maxVotes > 0) {
          const userVotes = allUserItems(newHashVotes, body.user.id);
          if (userVotes.length > maxVotes) {
            const itemPlural = maxVotes > 1 ? "items" : "item";
            await client.chat.postEphemeral({
              channel: inputs.channel_id,
              text: ":exclamation: You can only vote for " + maxVotes + " " +
                itemPlural,
              user: body.user.id,
            });
            return;
          }
        }
        confirmationMessage = "You voted for: " + item_text;
      }
      await client.apps.datastore.put({
        datastore: "vote_detail",
        item: {
          id: inputs.uuid + "_" + user_hash,
          vote_id: inputs.uuid,
          user_ids: newHashVotes,
        },
      });
      // get vote statistics
      const responseAllVotes = await client.apps.datastore.query({
        datastore: "vote_detail",
        expression: "#vote_id = :search_id",
        expression_attributes: { "#vote_id": "vote_id" },
        expression_values: { ":search_id": inputs.uuid },
      });
      if (responseAllVotes.ok) {
        const statistics = voteStatistics(responseAllVotes.items);
        const blocks = messageBlocks(
          inputs,
          statistics,
          false,
        );
        // update the message with the new statistics
        await client.chat.update({
          channel: inputs.channel_id,
          ts: body.container.message_ts,
          blocks: blocks,
        });
      }
      // if user can't see their name in the message, show an ephemeral message to confirm the action
      if (!(inputs.names_visibility_during === EVERYONE)) {
        await client.chat.postEphemeral({
          channel: inputs.channel_id,
          text: confirmationMessage,
          user: body.user.id,
        });
      }
    }
  },
).addBlockActionsHandler(
  "view_your_votes",
  async ({ body, inputs, client }) => {
    // Handler for when the user clicks on the "View your votes" button in the message
    // The message can be updated without changing the metadata, so a race condition can re-display the buttons while the poll is closed
    const isVoteClosed = body.message?.metadata?.event_payload?.isPollClosed;
    if (isVoteClosed) {
      // recover from this state by updating the message again to the closed state
      const statistics = body.message?.metadata?.event_payload?.statistics;
      const blocks = messageBlocks(
        inputs,
        statistics,
        isVoteClosed,
      );

      await client.chat.update({
        channel: inputs.channel_id,
        ts: body.container.message_ts,
        blocks: blocks,
      });
    } else {
      // fetch the user's votes from the datastore
      const user_id = body.user.id;
      const user_hash = hashUserID(body.user.id);

      // get the current votes for all users sharing this same hash number
      const responseHashVotes = await client.apps.datastore.get({
        datastore: "vote_detail",
        id: inputs.uuid + "_" + user_hash,
      });
      if (responseHashVotes.ok) {
        const hashVotes = responseHashVotes.item.user_ids || "";
        const selected_items = allUserItems(hashVotes, user_id);
        // set of items that the user has voted for
        const selected_items_set = new Set(selected_items);

        // open a modal with the user's votes
        const blocks = modalBlocks(
          inputs.options,
          selected_items_set,
        );
        await client.views.open({
          interactivity_pointer: body.interactivity.interactivity_pointer,
          view: {
            "type": "modal",
            "title": {
              "type": "plain_text",
              "text": "Your votes",
              "emoji": true,
            },
            "close": {
              "type": "plain_text",
              "text": "Close",
              "emoji": true,
            },
            "callback_id": "your_votes",
            "private_metadata": body.container.message_ts,
            "blocks": blocks,
          },
        });
      }
    }
  },
).addBlockActionsHandler(
  /vote_.*/,
  async ({ body, action, inputs, client }) => {
    // handler for when the user clicks on a vote button in the modal
    // Since the modal can be opened for a long time, we need to check if the poll is still open
    if (await isPollClosed(inputs.uuid, client)) {
      // if the poll is closed, update the modal to show the closed state
      await client.views.update({
        interactivity_pointer: body.interactivity.interactivity_pointer,
        view_id: body.view.id,
        view: {
          "type": "modal",
          "title": {
            "type": "plain_text",
            "text": "Your votes",
            "emoji": true,
          },
          "close": {
            "type": "plain_text",
            "text": "Close",
            "emoji": true,
          },
          "callback_id": "your_votes",
          "blocks": [{
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Poll closed :lock:",
            },
          }],
        },
      });
      return;
    }

    // check if this is a vote or remove vote action
    const isVoteYes = action.action_id.startsWith("vote_yes_");
    const suffix = action.action_id
      .replace("vote_yes_", "")
      .replace("vote_no_", "");
    // get the item index that the user clicked on
    const item_index = Number(suffix);
    // get the text of the item that the user clicked on
    const item_text = inputs.options[item_index - 1];
    // get the user's hash number, user votes are stored in the datastore using this hash number
    const user_hash = hashUserID(body.user.id);

    const responseHashVotes = await client.apps.datastore.get({
      datastore: "vote_detail",
      id: inputs.uuid + "_" + user_hash,
    });
    if (responseHashVotes.ok) {
      const hashVotes = responseHashVotes.item.user_ids || "";

      let newHashVotes = "";
      if (isVoteYes) {
        newHashVotes = addVote(hashVotes, body.user.id, item_index);
        const maxVotes = inputs.max_votes_per_user;
        if (maxVotes > 0) {
          const userVotes = allUserItems(newHashVotes, body.user.id);
          if (userVotes.length > maxVotes) {
            const itemPlural = maxVotes > 1 ? "items" : "item";
            await client.chat.postEphemeral({
              channel: inputs.channel_id,
              text: ":exclamation: You can only vote for " + maxVotes + " " +
                itemPlural,
              user: body.user.id,
            });
            return;
          }
        }
      } else {
        newHashVotes = removeVote(hashVotes, body.user.id, item_index);
      }
      // update the datastore with the new votes for all users sharing the same hash number
      await client.apps.datastore.put({
        datastore: "vote_detail",
        item: {
          id: inputs.uuid + "_" + user_hash,
          vote_id: inputs.uuid,
          user_ids: newHashVotes,
        },
      });

      // Update the modal
      const selected_items = allUserItems(newHashVotes, body.user.id);
      const selected_items_set = new Set(selected_items);
      const blocks = modalBlocks(
        inputs.options,
        selected_items_set,
      );
      await client.views.update({
        interactivity_pointer: body.interactivity.interactivity_pointer,
        view_id: body.view.id,
        view: {
          "type": "modal",
          "title": {
            "type": "plain_text",
            "text": "Your votes",
            "emoji": true,
          },
          "close": {
            "type": "plain_text",
            "text": "Close",
            "emoji": true,
          },
          "callback_id": "your_votes",
          "private_metadata": body.view.private_metadata,
          "blocks": blocks,
        },
      });
    }

    // get vote statistics
    const responseAllVotes = await client.apps.datastore.query({
      datastore: "vote_detail",
      expression: "#vote_id = :search_id",
      expression_attributes: { "#vote_id": "vote_id" },
      expression_values: { ":search_id": inputs.uuid },
    });
    if (responseAllVotes.ok) {
      const statistics = voteStatistics(responseAllVotes.items);
      const messageTimestamp = body.view.private_metadata;
      const blocks = messageBlocks(
        inputs,
        statistics,
        false,
      );
      // update the vote message with the new statistics
      await client.chat.update({
        channel: inputs.channel_id,
        ts: messageTimestamp,
        blocks: blocks,
      });
    }
    // send an ephermeral message to the user to confirm their vote, if they can't see it in the vote message
    if (!(inputs.names_visibility_during === EVERYONE)) {
      const confirmationMessage = isVoteYes
        ? "You voted for: " + item_text
        : "Vote removed for: " + item_text;
      await client.chat.postEphemeral({
        channel: inputs.channel_id,
        text: confirmationMessage,
        user: body.user.id,
      });
    }
  },
).addBlockActionsHandler(
  "menu",
  async ({ body, inputs, client }) => {
    // Handler for the "..." menu button
    await client.views.open({
      interactivity_pointer: body.interactivity.interactivity_pointer,
      view: {
        "type": "modal",
        "title": {
          "type": "plain_text",
          "text": "Options",
          "emoji": true,
        },
        "close": {
          "type": "plain_text",
          "text": "Close",
          "emoji": true,
        },
        "callback_id": "menu_options",
        "private_metadata": body.container.message_ts,
        "blocks": menuOptionsBlocks(
          inputs,
          body.user.id,
          body.message?.metadata?.event_payload?.isPollClosed,
          body.message?.metadata?.event_payload?.closeTime || 0,
        ),
      },
    });
  },
).addBlockActionsHandler(
  "delete_poll",
  async ({ body, inputs, client }) => {
    // Handler for the "Delete poll" button
    await closeVote(client, inputs, body.view.private_metadata);

    // delete the vote message
    const messageTimestamp = body.view.private_metadata;
    await client.chat.delete({
      channel: inputs.channel_id,
      ts: messageTimestamp,
    });

    await client.views.update({
      interactivity_pointer: body.interactivity.interactivity_pointer,
      view_id: body.view.id,
      view: {
        "type": "modal",
        "title": {
          "type": "plain_text",
          "text": "Options",
          "emoji": true,
        },
        "close": {
          "type": "plain_text",
          "text": "Close",
          "emoji": true,
        },
        "callback_id": "menu_options",
        "blocks": [{
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Poll deleted :boom:",
          },
        }],
      },
    });

    // don't complete the function, some users may have an open modal, they need the function to stay open
  },
).addBlockActionsHandler(
  "check_votes",
  async ({ body, inputs, client }) => {
    // Handler for the "Check votes" button, when the creator wants to see the current results during the voting period
    if (await isPollClosed(inputs.uuid, client)) {
      // since the modal can be open for a long time, the poll may have been closed in the meantime
      await client.views.update({
        interactivity_pointer: body.interactivity.interactivity_pointer,
        view_id: body.view.id,
        view: {
          "type": "modal",
          "title": {
            "type": "plain_text",
            "text": "Options",
            "emoji": true,
          },
          "close": {
            "type": "plain_text",
            "text": "Close",
            "emoji": true,
          },
          "callback_id": "menu_options",
          "blocks": [{
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Poll closed :lock:",
            },
          }],
        },
      });
    } else {
      // get vote statistics
      const responseAllVotes = await client.apps.datastore.query({
        datastore: "vote_detail",
        expression: "#vote_id = :search_id",
        expression_attributes: { "#vote_id": "vote_id" },
        expression_values: { ":search_id": inputs.uuid },
      });
      if (responseAllVotes.ok) {
        const statistics = voteStatistics(responseAllVotes.items);

        const show_voter_names: boolean =
          inputs.names_visibility_during === ONLY_ME;
        const blocks = [];
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Poll still open, here are the current results*",
          },
        });
        blocks.push(...resultsBlocks(
          inputs.title,
          inputs.options,
          statistics,
          show_voter_names,
        ));
        // update the modal with the new statistics (only available to the poll creator)
        await client.views.update({
          interactivity_pointer: body.interactivity.interactivity_pointer,
          view_id: body.view.id,
          view: {
            "type": "modal",
            "title": {
              "type": "plain_text",
              "text": "Options",
              "emoji": true,
            },
            "close": {
              "type": "plain_text",
              "text": "Close",
              "emoji": true,
            },
            "callback_id": "menu_options",
            "blocks": blocks,
          },
        });
      }
    }
  },
)
  .addBlockActionsHandler(
    "close_poll",
    async ({ body, inputs, client }) => {
      // Handler for the "Close poll" button
      await closeVote(client, inputs, body.view.private_metadata);

      await client.views.update({
        interactivity_pointer: body.interactivity.interactivity_pointer,
        view_id: body.view.id,
        view: {
          "type": "modal",
          "title": {
            "type": "plain_text",
            "text": "Options",
            "emoji": true,
          },
          "close": {
            "type": "plain_text",
            "text": "Close",
            "emoji": true,
          },
          "callback_id": "menu_options",
          "blocks": [{
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Poll closed :lock:",
            },
          }],
        },
      });
    },
  );

function hashUserID(userID: string): number {
  // convert user id to a number between 0 and 49
  let hash = 0;
  for (let i = 0; i < userID.length; i++) {
    hash += userID.charCodeAt(i);
  }
  return hash % 50;
}

/*
 * Returns true if the user has already voted for the item
 */
function didUserVote(
  votes: string,
  userID: string,
  item_index: number,
): boolean {
  const votesArray = votes.split("|");
  if (votesArray.length < item_index) {
    return false;
  }
  const votersForItem = votesArray[item_index - 1].split(",");
  return votersForItem.includes(userID);
}

/*
 * Returns the items for which the user has voted, given the votes string of all users sharing the same hash number
 */
function allUserItems(
  votes: string,
  userID: string,
): Array<number> {
  const votesArray = votes.split("|");
  const items = [];
  for (let i = 0; i < votesArray.length; i++) {
    const votersForItem = votesArray[i].split(",");
    if (votersForItem.includes(userID)) {
      items.push(i + 1);
    }
  }
  return items;
}
/*
 * Returns the votes string for all users sharing a hash number, with one user's vote removed
 */
function removeVote(
  votes: string,
  userID: string,
  item_index: number,
): string {
  const votesArray = votes.split("|");
  if (votesArray.length < item_index) {
    return votes;
  }
  const votersForItem = votesArray[item_index - 1].split(",");
  const newVotersForItem = votersForItem.filter((voter) => voter !== userID);
  votesArray[item_index - 1] = newVotersForItem.join(",");
  return votesArray.join("|");
}

/*
 * Returns the votes string for all users sharing a hash number, with one user's vote added
 */
function addVote(
  votes: string,
  userID: string,
  item_index: number,
): string {
  const votesArray = votes.split("|");
  for (let i = votesArray.length; i < item_index; i++) {
    votesArray.push("");
  }

  const votersForItem = votesArray[item_index - 1];
  if (votersForItem) {
    const votersForItemArray = votersForItem.split(",");
    if (!votersForItemArray.includes(userID)) {
      votersForItemArray.push(userID);
      votesArray[item_index - 1] = votersForItemArray.join(",");
    }
  } else {
    votesArray[item_index - 1] = userID;
  }

  return votesArray.join("|");
}

/*
 * return the blocks for the voting modal, all items listed, a check mark for the ones the active user voted for
 */
function modalBlocks(
  options: Array<string>,
  selectedSet: Set<number>,
  // deno-lint-ignore no-explicit-any
): Array<any> {
  const blocks = [];

  for (let i = 0; i < options.length; i++) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: options[i],
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: selectedSet.has(i + 1)
            ? " :white_check_mark:"
            : getEmoji(i + 1),
          emoji: true,
        },
        action_id: (selectedSet.has(i + 1) ? "vote_no_" : "vote_yes_") +
          (i + 1),
      },
    });
  }

  return blocks;
}

/*
 * return the blocks for the menu modal, showing poll information, and action buttons for poll creator only
 */
function menuOptionsBlocks(
  // deno-lint-ignore no-explicit-any
  inputs: any,
  userID: string,
  isPollClosed: boolean,
  closeTime: number,
  // deno-lint-ignore no-explicit-any
): Array<any> {
  const blocks = [];

  if (userID === inputs.creator_user_id) {
    if (!isPollClosed) {
      if (
        inputs.names_visibility_during === ONLY_ME ||
        inputs.counts_visibility_during === ONLY_ME
      ) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Check votes",
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: ":eyes:",
              emoji: true,
            },
            action_id: "check_votes",
          },
        });
      }
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Close poll",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: ":lock:",
            emoji: true,
          },
          action_id: "close_poll",
        },
      });
    }
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "Delete poll",
      },
      accessory: {
        type: "button",
        text: {
          type: "plain_text",
          text: ":x:",
          emoji: true,
        },
        action_id: "delete_poll",
      },
    });
  }

  blocks.push({
    type: "context",
    elements: pollInformation(inputs, isPollClosed, closeTime).map(
      (blockText: string) => ({
        type: "mrkdwn",
        text: blockText,
      }),
    ),
  });

  return blocks;
}

/*
 * return lines that describe the poll information
 */

function pollInformation(
  // deno-lint-ignore no-explicit-any
  inputs: any,
  isPollClosed: boolean,
  closeTime: number,
): Array<string> {
  const lines = [];
  // Creator
  lines.push("This poll was created by <@" + inputs.creator_user_id + ">");
  // max number of users
  if (inputs.max_votes_per_user === 0) {
    lines.push("There is no limit to the number of votes per user");
  } else {
    const votePlural = inputs.max_votes_per_user === 1 ? "vote" : "votes";
    lines.push(
      "There is a limit of " + inputs.max_votes_per_user +
        " " + votePlural + " per user",
    );
  }
  // Name visibility
  if (inputs.names_visibility_during === EVERYONE) {
    lines.push("Names are visible to everyone in the channel");
  } else if (
    inputs.names_visibility_during === ONLY_ME &&
    inputs.names_visibility_after === EVERYONE
  ) {
    lines.push(
      "Names are visible to <@" + inputs.creator_user_id +
        "> during the poll then to everyone in the channel after the poll is closed",
    );
  } else if (
    inputs.names_visibility_during === ONLY_ME &&
    inputs.names_visibility_after === ONLY_ME
  ) {
    lines.push(
      "Names are visible to <@" + inputs.creator_user_id + "> only",
    );
  } else if (
    inputs.names_visibility_during === NO_ONE &&
    inputs.names_visibility_after === EVERYONE
  ) {
    lines.push(
      "Names are visible to everyone in the channel after the poll is closed",
    );
  } else if (
    inputs.names_visibility_during === NO_ONE &&
    inputs.names_visibility_after === ONLY_ME
  ) {
    lines.push(
      "Names are visible to <@" + inputs.creator_user_id +
        "> after the poll is closed",
    );
  } else {
    lines.push("Names are not visible to anyone");
  }

  // Vote counts visibility
  if (inputs.counts_visibility_during === EVERYONE) {
    lines.push("Vote counts are visible to everyone in the channel");
  } else if (
    inputs.counts_visibility_during === ONLY_ME &&
    inputs.counts_visibility_after === EVERYONE
  ) {
    lines.push(
      "Vote counts are visible to <@" + inputs.creator_user_id +
        "> during the poll then to everyone in the channel after the poll is closed",
    );
  } else if (
    inputs.counts_visibility_during === ONLY_ME &&
    inputs.counts_visibility_after === ONLY_ME
  ) {
    lines.push(
      "Vote counts are visible to <@" + inputs.creator_user_id + "> only",
    );
  } else if (
    inputs.counts_visibility_during === NO_ONE &&
    inputs.counts_visibility_after === EVERYONE
  ) {
    lines.push(
      "Vote counts are visible to everyone in the channel after the poll is closed",
    );
  } else {
    lines.push(
      "Vote counts are visible to <@" + inputs.creator_user_id +
        "> after the poll is closed",
    );
  }

  // Close time
  if (isPollClosed) {
    lines.push("Poll closed at " + new Date(closeTime).toLocaleString());
  } else {
    lines.push(
      "Poll closes at " +
        new Date(inputs.end_date_time * 1000).toLocaleString(),
    );
  }
  return lines;
}
