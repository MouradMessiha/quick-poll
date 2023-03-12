import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

// export const VoteHeaderDatastore = DefineDatastore({
//   name: "vote_header",
//   primary_key: "id",
//   attributes: {
//     id: { type: Schema.types.string },
//   },
// });

// export const VoteItemDatastore = DefineDatastore({
//   name: "vote_item",
//   primary_key: "id",
//   attributes: {
//     id: { type: Schema.types.string },
//     description: { type: Schema.types.string },
//   },
// });

// export const UserVoteDatastore = DefineDatastore({
//   name: "user_vote",
//   primary_key: "id",
//   attributes: {
//     id: { type: Schema.types.string },
//     ts_user_id: { type: Schema.types.string },
//   },
// });

export const VoteHeaderDatastore = DefineDatastore({
  name: "vote_header",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string },
    is_vote_closed: { type: Schema.types.boolean },
    trigger_id: { type: Schema.types.string },
  },
});

export const VoteDetailDatastore = DefineDatastore({
  name: "vote_detail",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string },
    vote_id: { type: Schema.types.string },
    user_ids: { type: Schema.types.string },
  },
});

export const GlobalSettingsDatastore = DefineDatastore({
  name: "global_settings",
  primary_key: "id",
  attributes: {
    id: { type: Schema.types.string },
    is_cleanup_trigger_created: { type: Schema.types.boolean },
  },
});
