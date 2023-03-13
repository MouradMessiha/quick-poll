import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

// one record per poll
export const VoteHeaderDatastore = DefineDatastore({
  name: "vote_header",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string }, // uuid of poll
    is_vote_closed: { type: Schema.types.boolean },
    trigger_id: { type: Schema.types.string }, // trigger for closing the poll at end time
  },
});

// one record per user_id hash (0-49) per poll
export const VoteDetailDatastore = DefineDatastore({
  name: "vote_detail",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string }, // uuid + user_id_hash
    vote_id: { type: Schema.types.string }, // uuid
    user_ids: { type: Schema.types.string }, // user_id, user_id|user_id||user_id (position in list corresponds to vote item index)
  },
});

// one record in datastore, for settings
export const GlobalSettingsDatastore = DefineDatastore({
  name: "global_settings",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string },
    is_cleanup_trigger_created: { type: Schema.types.boolean },
  },
});
