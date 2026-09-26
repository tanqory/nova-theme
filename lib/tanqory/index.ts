// @tanqory/theme-kit — public API. Themes import only from here.
export { defineSection } from './defineSection'
export {
  createAnalytics,
  getAnalytics,
  subscribe,
  type Analytics,
  type AnalyticsOptions,
  type StorefrontEventType,
  type StorefrontEvent,
} from './analytics'
export {
  getConsent,
  setConsent,
  hasConsent,
  hasDecided,
  setBannerRequired,
  isBannerRequired,
  setConsentMode,
  holdConsentClosed,
  isConsentArmed,
  onConsentModeChange,
  getConsentMode,
  consentModeFromShop,
  onConsentChange,
  type Consent,
  type ConsentMode,
} from './consent'
export { defineTheme, defineSettings, type ThemeConfig, type SettingsSchema } from './config'
export { ThemeProvider, useSettings, useT } from './theme-context'
export { mount, groupsFromGlob, resolvePageSections, type MountOptions } from './mount'
export {
  DEFAULT_STUDIO_ORIGINS,
  isPreviewPlane,
  isLoopbackHostname,
  isExactOrigin,
  resolvePreviewOrigins,
  isAllowedStudioOrigin,
} from './preview-origins'
export { renderStorefrontHTML, renderSectionPreviewHTML } from './ssg'
export { SectionTree } from './SectionTree'
export { Editor } from './editor'
export { registerSections, getSection, allSections } from './registry'
export {
  DataProvider,
  useData,
  createMockData,
  createLiveData,
  createLiveDataFromSnapshot,
  formatMoney,
  formatMoneyWithCurrency,
  formatMoneyWithoutCurrency,
  formatMoneyWithoutTrailingZeros,
  imageUrl,
  formatDate,
  formatWeight,
} from './data'
export { CartProvider, useCart } from './cart'
export {
  DynamicSourceProvider,
  useResourceContext,
  useBound,
  useBoundText,
  isBoundSource,
  resolveBoundSource,
  collectBoundIdentifiers,
} from './dynamic-source'
export type { Bound, BoundSource, ResourceContextValue } from './dynamic-source'
export type {
  CartApi,
  CartLine,
  CartState,
  AddToCartInput,
  AppliedDiscountCode,
  AppliedGiftCard,
} from './cart'
export type {
  LiveDataOptions,
  Localization,
  LocalizedCountry,
  LocalizedMarket,
  LocalizedCurrency,
  ProductOption,
  ProductVariant,
  ImageRef,
  QuantityRule,
  UnitPriceMeasurement,
  StoreAvailability,
  SellingPlan,
  SellingPlanOption,
  SellingPlanGroup,
  Measurement,
  Rating,
  FocalPoint,
  ImagePresentation,
  ModelSource,
  VideoSource,
  GenericFile,
  Recommendations,
} from './data'
export { toRecommendations } from './data'
export { jsxToJSON } from './jsx-to-json'
export { tag, type Tag } from './composition'
export type { Money, Product, Collection, DataApi } from './data'
export type { SectionDef, SectionProps, ContentNode, PageDoc, AttrSpec, SectionPreset, SectionGroupDoc } from './types'

// commerce-standard storefront extensions (live data layer): navigation menus,
// blog/articles, search, recommendations, metaobjects, shop/policies, and the
// full customer account flow. See storefront.ts.
export { customerTokenStore } from './storefront'
export type {
  StorefrontExtensions,
  Menu,
  MenuItem,
  MenuItemType,
  Blog,
  Article,
  SearchResults,
  CollectionProductsPage,
  PredictiveSearchResults,
  PageInfo,
  Filter,
  Metaobject,
  MetaobjectField,
  Shop,
  ShopPolicy,
  Image as StorefrontImage,
  Seo,
  CustomerApi,
  Customer,
  CustomerAddress,
  CustomerAddressInput,
  CustomerPaymentMethod,
  Order,
  OrderTransaction,
  OrderGiftCard,
  StoreCreditAccount,
  OrderLineItem,
  AuthResult,
  MutationResult,
} from './storefront'

// Tanqory Theme Contract v1 — the shared agreement between theme, CMS, Editor
// and AI. Also built as its own dependency-free entry (`@tanqory/theme-kit/contract`)
// so studio-api can vendor it without an npm install.
export {
  CONTRACT_VERSION,
  KIT_COMPATIBILITY,
  FIELD_TYPES,
  FIELD_TYPE_ALIASES,
  EDITOR_ONLY_TYPES,
  UNIVERSAL_CONSTRAINTS,
  canonicalFieldType,
  fieldType,
  TEMPLATE_AREAS,
  CONTEXT_KINDS,
  CURRENT_CONTENT_VERSION,
  NODE_ID_PATTERN,
  mintNodeId,
  roleOf,
  templateContext,
  SECTION_ROLES,
  GROUP_SLOTS,
  GROUP_NAME_PATTERN,
  resolvePage,
  resolvePageFrom,
  splitPage,
  groupImpact,
  extractGroups,
  slotSignature,
  inlineSlotOf,
  isSectionGroupDoc,
  validatePage,
  validateGroup,
  toEditorShape,
  toRuntimeShape,
  ensureNodeIds,
  validateDocument,
  validateSectionContract,
  formatIssues,
} from './contract'
export type {
  FieldTypeDef,
  FieldTypeId,
  FieldTypeAlias,
  AnyFieldType,
  ControlKind,
  ValueKind,
  ContractNode,
  ContractPageDoc,
  SectionContract,
  SectionPresetContract,
  AttrContract,
  TemplateArea,
  ContextKind,
  SectionRole,
  PlacementContract,
  GroupSlot,
  GroupBinding,
  GroupedPageDoc,
  GroupMap,
  NodeSource,
  SlotResolution,
  ResolvedPage,
  SplitResult,
  SplitOptions,
  ExtractOptions,
  ExtractReport,
  ExtractResult,
  ValidationIssue,
  ValidationResult,
  ValidationCode,
  SectionCatalog,
  ValidateOptions,
  Severity,
  EditorNode,
  EditorDoc,
  TransformReport,
} from './contract'
