export function urlEncode(data) {
  return Object.keys(data)
    .filter(key => data[key] !== undefined)
    .map(key => `${ key }=${ encodeURIComponent(data[key]) }`)
    .join("&");
}

export function queryString(data) {
  const encodedData = urlEncode(data);
  return encodedData ? `?${ encodedData }` : "";
}

const querylessUrlAndQueryObjectFromFullUrl = (urlString) => {
  if (urlString.indexOf('?') === -1) {
    return {
      querylessUrl: urlString,
      queryObject: {},
    };
  }

  const splitUrl = urlString.split("?");
  const querylessUrl = splitUrl[0];
  const queryString = splitUrl.slice(1).join("&");

  return {
    querylessUrl,
    queryObject: queryParamObject(queryString),
  };
}

const queryParamObject = (queryParamString) => {
  return queryParamString
    .split("&")
    .map(str => {
      let [key, value] = str.split('=');
      return {[key]: decodeURI(value)};
    })
    .reduce((prev, curr) => Object.assign(prev, curr));
}

export const mergeQueryParamsIntoUrl = (urlString, queryParams) => {
  const { querylessUrl, queryObject } = querylessUrlAndQueryObjectFromFullUrl(urlString);
  const fullQueryString = queryString(Object.assign(queryObject, queryParams));
  const t = `${querylessUrl}${fullQueryString}`;
  return t;
}

export function allPromisesSettled(promises) {
  return Promise.all(promises.map(p => Promise.resolve(p).then(v => ({
    state: 'fulfilled',
    value: v,
  }), r => ({
    state: 'rejected',
    reason: r,
  }))));
}
