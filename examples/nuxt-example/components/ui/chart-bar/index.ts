export { default as BarChart } from './BarChart.vue'

import type { Spacing } from '@unovis/ts'

type KeyOf<T extends Record<string, any>> = Extract<keyof T, string>

export interface BaseChartProps<T extends Record<string, any>> {
  /**
   * The source data, in which each entry is a dictionary.
   */
  data: T[]
  /**
   * Select the categories from your data. Used to populate the legend and toolip.
   */
  categories: KeyOf<T>[]
  /**
   * Sets the key to map the data to the axis.
   */
  index: KeyOf<T>
  /**
   * Change the default colors.
   */
  colors?: string[]
  /**
   * Margin of each the container
   */
  margin?: Spacing
  /**
   * Change the opacity of the non-selected field
   * @default 0.2
   */
  filterOpacity?: number
  /**
   * Function to format X label
   */
  xFormatter?: (tick: number | Date, i: number, ticks: number[] | Date[]) => string
  /**
   * Function to format Y label
   */
  yFormatter?: (tick: number | Date, i: number, ticks: number[] | Date[]) => string
  /**
   * Controls the visibility of the X axis.
   * @default true
   */
  showXAxis?: boolean
  /**
   * Controls the visibility of the Y axis.
   * @default true
   */
  showYAxis?: boolean
  /**
   * Controls the visibility of tooltip.
   * @default true
   */
  showTooltip?: boolean
  /**
   * Controls the visibility of legend.
   * @default true
   */
  showLegend?: boolean
  /**
   * Controls the visibility of gridline.
   * @default true
   */
  showGridLine?: boolean
}
