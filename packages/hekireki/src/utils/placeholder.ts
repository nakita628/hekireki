// A generated file names a framework class through a placeholder: `\0T|java.time.Instant\0`
// where a type is expected, `\0E|...\0` where the class is the receiver of an expression. Which
// simple names the file may use is only known once it is assembled, so each language resolves the
// placeholders last. NUL never survives into emitted text otherwise (string literals escape it),
// so a placeholder cannot collide with user data.
export const REF = '\u0000'

export function typeRef(fullName: string) {
  return `${REF}T|${fullName}${REF}`
}

export function exprRef(fullName: string) {
  return `${REF}E|${fullName}${REF}`
}
