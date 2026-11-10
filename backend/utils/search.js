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

// For search boxes: matches anywhere in the value, ignoring case. "ada" finds
// "Ada Obi" and "madalyn@x.com". Characters are literal, as above.
export const containsIgnoringCase = (text) => ({
  $regex: escapeRegex(String(text).trim()),
  $options: "i",
});