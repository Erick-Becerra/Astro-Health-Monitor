import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const time = (iso) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// Line chart of one vital sign over the latest readings.
export default function VitalsChart({ readings, metric }) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={readings} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#1a3a78" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={time}
            stroke="#9db0d4"
            tickLine={false}
            minTickGap={48}
            fontSize={12}
          />
          <YAxis
            stroke="#9db0d4"
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
            width={48}
            fontSize={12}
          />
          <Tooltip
            labelFormatter={time}
            formatter={(value) => [`${value} ${metric.unit}`, metric.label]}
            contentStyle={{
              background: "#050a30",
              border: "1px solid #1a3a78",
              borderRadius: 6,
            }}
            itemStyle={{ color: "#eef2fb" }}
            labelStyle={{ color: "#9db0d4" }}
          />
          <Line
            type="monotone"
            dataKey={metric.key}
            stroke="#8fb4ff"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
