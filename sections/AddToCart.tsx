import { defineSection, type SectionProps } from '../lib/tanqory/index'
import { Button } from '../components/Button'
import { useProductContext } from '../components/product-context'
import { NotifyMe } from '../components/NotifyMe'

/** PDP BLOCK — the add-to-cart button, wired to the shared context (variant + qty). */
export function AddToCart({ attributes }: SectionProps): JSX.Element {
  const ctx = useProductContext()
  if (!ctx) return <></>
  const label = (attributes.label as string) || 'Add to cart'
  // A concrete variant that exists and is out of stock — the only case "notify me" makes sense.
  const notifyVariantId =
    ctx.soldOut && ctx.selectedVariant && ctx.selectedVariant.availableForSale === false
      ? ctx.selectedVariant.id
      : undefined
  return (
    <div style={{ marginTop: 'var(--space-3)' }}>
    <div className="cluster">
      <Button
        label={ctx.soldOut ? 'Sold out' : ctx.adding ? 'Adding…' : label}
        onClick={() => void ctx.add()}
        disabled={ctx.soldOut || ctx.adding}
        variant="primary"
        size="lg"
        fullWidth
      />
    </div>
    {notifyVariantId && <NotifyMe variantId={notifyVariantId} />}
    </div>
  )
}

export default defineSection({
  name: 'add-to-cart',
  role: 'block',
  requiresContext: ['product'],
  title: 'Add to cart',
  description: 'The Add to cart button for the current product.',
  category: 'block',
  icon: '+',
  attributes: {
    label: { type: 'text', default: 'Add to cart', label: 'Label' },
  },
  component: AddToCart,
})
