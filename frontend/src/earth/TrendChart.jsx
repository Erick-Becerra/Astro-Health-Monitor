import { CartesianGrid, Line, LineChart, ReferenceArea, XAxis, YAxis } from "recharts";
import { levelBands, lostRanges, toChartData } from "./chartData.js";

/**
 * Trend of one or two variables with the semaphore as background and the periods without signal marked.
 *   readings = earth.readings(id, { since, limit: 5000 })       (without bucketSeconds if you want the lost periods)
 *   history  = earth.levelHistory(id)
 *   <TrendChart readings={readings} history={history} keys={["heart_rate"]} t={t} width={640} height={240} />
 * For long ranges ask the readings with bucketSeconds (the lost periods then show as gaps in the line).
 */
export default function TrendChart({ readings, history = [], keys, t, group = "cardiovascular", width = 640, height = 240 }) {
  const data = toChartData(readings, keys);
  const first = data[0]?.time;
  const last = data[data.length - 1]?.time;
  const bands = levelBands(history).filter((b) => b.to >= first && b.from <= last);
  return (
    <LineChart width={width} height={height} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]}
             tickFormatter={(ms) => new Date(ms).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} />
      <YAxis domain={["auto", "auto"]} />
      {bands.map((b) => (
        <ReferenceArea key={b.from} x1={Math.max(b.from, first)} x2={Math.min(b.to, last)} fill={t.levelColor(b.level)} fillOpacity={0.12} />
      ))}
      {lostRanges(readings, group).map((r) => (
        <ReferenceArea key={`lost-${r.from}`} x1={r.from} x2={r.to} fill="#6B7280" fillOpacity={0.35} label={t.ui("noSignal")} />
      ))}
      {keys.map((k) => (
        <Line key={k} dataKey={k} name={t.indicator(k)} dot={false} isAnimationActive={false} connectNulls={false} />
      ))}
    </LineChart>
  );
}
