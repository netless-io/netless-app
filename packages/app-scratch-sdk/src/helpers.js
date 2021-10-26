export const mergeArray = (currArr, newArr, idKey) => {
  if (
    newArr.length === currArr.length &&
    newArr.every((item, i) => item[idKey] === currArr[i][idKey])
  ) {
    return currArr;
  }
  const currMap = new Map(currArr.map(item => [item[idKey], item]));
  return newArr.map(item => (currMap.has(item[idKey]) ? currMap.get(item[idKey]) : item));
};
