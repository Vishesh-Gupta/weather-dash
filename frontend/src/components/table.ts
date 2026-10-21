import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  type RowData,
} from '@tanstack/react-table'

// Features live at module scope so the table's row models stay stable across renders.
export const tableFeatureSet = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
})

export type Features = typeof tableFeatureSet

export const columnHelper = <TData extends RowData>() => createColumnHelper<Features, TData>()
