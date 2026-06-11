export interface CustomVariationDef {
  id: string
  name: string
  wgsl: string
  createdAt: number
  updatedAt: number
}

export interface CustomVariationStore {
  version: number
  variations: Record<string, CustomVariationDef>
}
