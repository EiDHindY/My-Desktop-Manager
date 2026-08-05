export const fuzzyMatch = (str: string, q: string) => {
  let i = 0;
  for (let j = 0; j < str.length && i < q.length; j++) {
    if (str[j] === q[i]) i++;
  }
  return i === q.length;
};
