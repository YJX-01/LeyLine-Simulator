import { init, use } from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, AriaComponent, SVGRenderer]);
export { init };
