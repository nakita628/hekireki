import type { Relationship } from '../relationship/build-relation-line'

/**
 * isRelationship
 * @param { string } key
 * @returns { key is Relationship }
 */
export function isRelationship(key: string): key is Relationship {
  return ['zero-one', 'one', 'zero-many', 'many'].includes(key)
}
