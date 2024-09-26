export { default as DonutChart } from './DonutChart.vue'

import type { Spacing } from '@unovis/ts'

type KeyOf<T extends Record<string, any>> = Extract<keyof T, string>

export interface BaseChartProps<T extends Record<string, any>> {
  /**
   * The source data, in which each entry is a dictionary.
   */
  data: T[]
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
   * Controls the visibility of tooltip.
   * @default true
   */
  showTooltip?: boolean
  /**
   * Controls the visibility of legend.
   * @default true
   */
  showLegend?: boolean
}
