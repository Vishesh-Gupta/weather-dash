import { useTable, type ColumnDef, type RowData } from '@tanstack/react-table'

import { tableFeatureSet, type Features } from './table'

export function DataTable<TData extends RowData>({
  data,
  columns,
  caption,
}: {
  data: readonly TData[]
  columns: readonly ColumnDef<Features, TData, any>[] // eslint-disable-line @typescript-eslint/no-explicit-any
  caption: string
}) {
  const table = useTable({ features: tableFeatureSet, columns, data })

  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button type="button" onClick={header.column.getToggleSortingHandler()}>
                        <table.FlexRender header={header} />
                        {sorted === 'asc' ? ' ▲' : sorted === 'desc' ? ' ▼' : ''}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td key={cell.id}>
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
