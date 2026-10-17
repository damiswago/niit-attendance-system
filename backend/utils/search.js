// Helpers for matching text typed into search boxes and filters.

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// A MongoDB condition that matches the whole value, ignoring upper / lower
// case and surrounding spaces: "web development" matches "Web Development".
// Every character is matched literally, so a course called "C++ (Intro)" works
// and a "." in the search can't act as a wildcard.
export const sameTextIgnoringCase = (text) => ({
  $regex: `^${escapeRegex(String(text).trim())}$`,
  $options: "i",
});
