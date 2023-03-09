import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { SlackAPIClient } from "deno-slack-api/types.ts";
import { EVERYONE, NO_ONE, ONLY_ME } from "./create_poll.ts";

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

export default SlackFunction(
  PollFunction,
  async ({ inputs, client }) => {
    const blocks = messageBlocks(inputs, {}, false);
    await client.chat.postMessage({
      channel: inputs.channel_id,
      blocks: blocks,
      metadata: {
        event_type: "quick_poll",
        event_payload: {
          isPollClosed: false,
        },
      },
    });

    return {
      completed: false,
    };
  },
).addBlockActionsHandler(
  /toggle_.*/, // action_id
  async ({ body, action, inputs, client }) => { // The second argument is the handler function itself
    const isVoteClosed = body.message?.metadata?.event_payload?.isPollClosed;
    if (isVoteClosed) {
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
    const item_index = Number(action.action_id.replace("toggle_", ""));
    const item_text: string = inputs.options[item_index - 1];
    const user_hash = hashUserID(body.user.id);

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

        await client.chat.update({
          channel: inputs.channel_id,
          ts: body.container.message_ts,
          blocks: blocks,
        });
      }
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
  "view_your_votes", // action_id
  async ({ body, inputs, client }) => { // The second argument is the handler function itself
    const isVoteClosed = body.message?.metadata?.event_payload?.isPollClosed;
    if (isVoteClosed) {
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
      const user_id = body.user.id;
      const user_hash = hashUserID(body.user.id);

      const responseHashVotes = await client.apps.datastore.get({
        datastore: "vote_detail",
        id: inputs.uuid + "_" + user_hash,
      });
      if (responseHashVotes.ok) {
        const hashVotes = responseHashVotes.item.user_ids || "";
        const selected_items = allUserItems(hashVotes, user_id);
        const selected_items_set = new Set(selected_items);

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
  /vote_.*/, // action_id
  async ({ body, action, inputs, client }) => { // The second argument is the handler function itself
    if (await isPollClosed(inputs.uuid, client)) {
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

    const isVoteYes = action.action_id.startsWith("vote_yes_");
    const suffix = action.action_id
      .replace("vote_yes_", "")
      .replace("vote_no_", "");
    const item_index = Number(suffix);
    const item_text = inputs.options[item_index - 1];
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
      await client.chat.update({
        channel: inputs.channel_id,
        ts: messageTimestamp,
        blocks: blocks,
      });
    }

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
  "menu", // action_id
  async ({ body, inputs, client }) => { // The second argument is the handler function itself;
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
  "delete_poll", // action_id
  async ({ body, inputs, client }) => { // The second argument is the handler function itself
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

    // don't complete the function, some users may have an open modal
  },
).addBlockActionsHandler(
  "check_votes",
  async ({ body, inputs, client }) => {
    if (await isPollClosed(inputs.uuid, client)) {
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
    "close_poll", // action_id
    async ({ body, inputs, client }) => { // The second argument is the handler function itself
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

function getEmoji(index: number): string {
  if (index > 9) {
    return getEmoji(Math.floor(index / 10)) + " " + getEmoji(index % 10);
  }
  switch (index) {
    case 0:
      return ":zero:";
    case 1:
      return ":one:";
    case 2:
      return ":two:";
    case 3:
      return ":three:";
    case 4:
      return ":four:";
    case 5:
      return ":five:";
    case 6:
      return ":six:";
    case 7:
      return ":seven:";
    case 8:
      return ":eight:";
    case 9:
      return ":nine:";
  }
  return "-";
}

function hashUserID(userID: string): number {
  // convert user id to a number between 0 and 49
  let hash = 0;
  for (let i = 0; i < userID.length; i++) {
    hash += userID.charCodeAt(i);
  }
  return hash % 50;
}

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

// deno-lint-ignore no-explicit-any
function voteStatistics(items: Array<any>): any {
  // deno-lint-ignore no-explicit-any
  const statistics: any = {};
  let totalVotes = 0;
  for (const item of items) {
    const votes = item.user_ids;
    const itemsVoters = votes.split("|");
    for (let i = 0; i < itemsVoters.length; i++) {
      const voters = itemsVoters[i];
      if (voters) {
        const votersArray = voters.split(",");
        const existingVoters = statistics["item_" + (i + 1)] || [];
        statistics["item_" + (i + 1)] = existingVoters.concat(votersArray);
        totalVotes += votersArray.length;
      }
    }
  }
  statistics.totalVotes = totalVotes;
  return statistics;
}

function messageBlocks(
  // deno-lint-ignore no-explicit-any
  inputs: any,
  // deno-lint-ignore no-explicit-any
  statistics: any,
  isPollClosed: boolean,
  // deno-lint-ignore no-explicit-any
): Array<any> {
  const blocks = [];

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: inputs.title,
    },
    accessory: {
      type: "button",
      text: {
        type: "plain_text",
        text: "...",
        emoji: false,
      },
      action_id: "menu",
    },
  });

  blocks.push({
    type: "divider",
  });

  const show_voter_names = inputs.names_visibility_during === EVERYONE ||
    (inputs.names_visibility_after === EVERYONE && isPollClosed);
  const show_vote_counts = inputs.counts_visibility_during === EVERYONE ||
    (inputs.counts_visibility_after === EVERYONE && isPollClosed);

  for (let i = 0; i < inputs.options.length; i++) {
    const voters = statistics["item_" + (i + 1)] || [];
    const voterNames = voters.map((voter: string) => {
      return "<@" + voter + ">";
    }).join("");
    const totalVotes = voters.length;
    const votePlural = totalVotes === 1 ? "vote" : "votes";
    const voteCount = totalVotes ? `${totalVotes} ${votePlural}` : "no votes";
    const optionText = inputs.options[i] +
      (show_vote_counts ? "\n" + "`" + voteCount + "`" : "") +
      (show_voter_names ? (" " + voterNames).trimEnd() : "");

    if (isPollClosed) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: optionText,
        },
      });
    } else {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: optionText,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: getEmoji(i + 1),
            emoji: true,
          },
          action_id: "toggle_" + (i + 1),
        },
      });
    }
  }

  const totalVotes = statistics.totalVotes || 0;
  const votePlural = totalVotes === 1 ? "vote" : "votes";
  const totalMessage = (isPollClosed ? "Poll closed. " : "") +
    (totalVotes ? totalVotes + ` ${votePlural} received.` : " ");

  blocks.push({
    type: "context",
    elements: [
      {
        type: "plain_text",
        text: totalMessage,
        emoji: true,
      },
    ],
  });

  if (!isPollClosed) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View your votes",
            emoji: true,
          },
          action_id: "view_your_votes",
        },
      ],
    });
  }

  return blocks;
}

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

function resultsBlocks(
  title: string,
  options: Array<string>,
  // deno-lint-ignore no-explicit-any
  statistics: any,
  send_voter_names: boolean,
  // deno-lint-ignore no-explicit-any
): Array<any> {
  const blocks = [];

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: title,
    },
  });

  blocks.push({
    type: "divider",
  });

  for (let i = 0; i < options.length; i++) {
    const voters = statistics["item_" + (i + 1)] || [];
    const voterNames = voters.map((voter: string) => {
      return "<@" + voter + ">";
    }).join("");
    const totalVotes = voters.length;
    const votePlural = totalVotes === 1 ? "vote" : "votes";
    const voteCount = totalVotes ? `${totalVotes} ${votePlural}` : `no votes`;
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: options[i] + "\n" + "`" + voteCount + "`" +
          (send_voter_names ? " " + voterNames : ""),
      },
    });
  }

  return blocks;
}

async function closeVote(
  client: SlackAPIClient,
  // deno-lint-ignore no-explicit-any
  inputs: any,
  messageTimestamp: string,
) {
  if (!await isPollClosed(inputs.uuid, client)) {
    // get vote statistics
    const responseAllVotes = await client.apps.datastore.query({
      datastore: "vote_detail",
      expression: "#vote_id = :search_id",
      expression_attributes: { "#vote_id": "vote_id" },
      expression_values: { ":search_id": inputs.uuid },
    });
    if (responseAllVotes.ok) {
      const statistics = voteStatistics(responseAllVotes.items);
      const eventPayload = {
        statistics,
        isPollClosed: true,
        closeTime: Date.now(),
      };
      const blocks = messageBlocks(
        inputs,
        statistics,
        true,
      );

      await client.chat.update({
        channel: inputs.channel_id,
        ts: messageTimestamp,
        blocks: blocks,
        metadata: {
          event_type: "quick_poll",
          event_payload: eventPayload,
        },
      });

      const send_voter_names: boolean =
        inputs.names_visibility_after === ONLY_ME;
      const send_vote_counts: boolean =
        inputs.counts_visibility_after === ONLY_ME;
      if (send_voter_names || send_vote_counts) {
        const blocks = [];
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Poll closed, here are the results*",
          },
        });

        blocks.push(...resultsBlocks(
          inputs.title,
          inputs.options,
          statistics,
          send_voter_names,
        ));

        await client.chat.postMessage({
          channel: inputs.creator_user_id,
          blocks: blocks,
        });
      }

      await client.apps.datastore.put({
        datastore: "vote_header",
        item: {
          id: inputs.uuid,
          is_vote_closed: true,
        },
      });
    }
  }
}

async function isPollClosed(
  uuid: string,
  client: SlackAPIClient,
): Promise<boolean> {
  const responseVoteHeader = await client.apps.datastore.get({
    datastore: "vote_header",
    id: uuid,
  });
  if (responseVoteHeader.ok) {
    return responseVoteHeader.item.is_vote_closed === undefined
      ? true
      : responseVoteHeader.item.is_vote_closed;
  }
  return false;
}

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
