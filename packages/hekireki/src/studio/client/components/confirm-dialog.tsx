import { AlertDialog, Button } from '@heroui/react'
import type { ReactNode } from 'react'
import { LuTriangleAlert } from 'react-icons/lu'

/**
 * What stands between a click and a row that is gone. `window.confirm` cannot say which row it
 * is about, blocks the page while it is up, and looks like the browser rather than like Studio;
 * this says what is about to be deleted, in the words of the table it is being deleted from.
 */
export function ConfirmDialog({
  isOpen,
  title,
  detail,
  confirmLabel,
  isPending,
  onConfirm,
  onOpenChange,
}: {
  readonly isOpen: boolean
  readonly title: string
  /** The rows, keys or statement the action is about, shown verbatim under the title. */
  readonly detail: ReactNode
  readonly confirmLabel: string
  readonly isPending: boolean
  readonly onConfirm: () => void
  readonly onOpenChange: (open: boolean) => void
}) {
  return (
    <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Container size="md">
        <AlertDialog.Dialog className="gap-4" aria-label={title}>
          <AlertDialog.Header>
            <AlertDialog.Icon status="danger">
              <LuTriangleAlert />
            </AlertDialog.Icon>
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>{detail}</AlertDialog.Body>
          <AlertDialog.Footer>
            <Button
              variant="ghost"
              onPress={() => {
                onOpenChange(false)
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" isDisabled={isPending} onPress={onConfirm}>
              {confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}
