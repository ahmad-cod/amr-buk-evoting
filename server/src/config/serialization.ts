import mongoose from 'mongoose';

/**
 * Global JSON serialization for all Mongoose documents.
 *
 * The frontend keys every entity off a string `id` field (not `_id`). By
 * default Mongoose's JSON output includes `_id` (an ObjectId) but no `id`,
 * which means raw documents returned by controllers arrive at the client
 * with `id === undefined`. That breaks anything that submits an id back to
 * the API — e.g. selecting a position when adding a candidate, which then
 * fails server-side validation with "Validation failed".
 *
 * This applies a single rule everywhere: expose `id` as a string, drop the
 * raw `_id`, and omit the internal version key. It must be imported before
 * any schema/model is compiled, so it is imported at the very top of app.ts.
 */
mongoose.set('toJSON', {
  versionKey: false,
  transform(_doc, ret: Record<string, unknown>) {
    if (ret._id != null) {
      ret.id = String(ret._id);
      delete ret._id;
    }
    return ret;
  },
});
