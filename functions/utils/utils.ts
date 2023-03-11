import { SlackAPIClient } from "deno-slack-api/types.ts";

export const EVERYONE = "everyone";
export const ONLY_ME = "only_me";
export const NO_ONE = "no_one";
export const LIMITED = "limited";
export const UNLIMITED = "unlimited";

export function getEmoji(index: number): string {
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

export async function closeVote(
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

export async function isPollClosed(
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

// deno-lint-ignore no-explicit-any
export function voteStatistics(items: Array<any>): any {
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

export function messageBlocks(
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

export function resultsBlocks(
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
