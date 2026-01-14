export const CacheKeys = {
  USERS_LIST: 'users:list',
  GROUPS_LIST: 'groups:list',

  usersListKey: (limit: number, offset: number): string =>
    `${CacheKeys.USERS_LIST}:${limit}:${offset}`,

  groupsListKey: (limit: number, offset: number): string =>
    `${CacheKeys.GROUPS_LIST}:${limit}:${offset}`,
} as const;

export const CacheTTL = {
  USERS_LIST: 30,   // 30 seconds for user lists
  GROUPS_LIST: 30,  // 30 seconds for group lists
} as const;
