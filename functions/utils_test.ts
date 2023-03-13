import { assertEquals } from "https://deno.land/std@0.153.0/testing/asserts.ts";
import { getEmoji } from "./utils/utils.ts";

Deno.test("emoji generator test", () => {
  assertEquals(getEmoji(1), ":one:");
});
