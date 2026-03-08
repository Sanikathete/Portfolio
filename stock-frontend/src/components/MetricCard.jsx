function MetricCard({ eyebrow, value, tone = "blue", detail }) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <div className={`metric-orb ${tone}`} />
      <div>
        <p className="metric-label">{eyebrow}</p>
        <h3>{value}</h3>
        {detail ? <p className="metric-detail">{detail}</p> : null}
      </div>
    </div>
  );
}

export default MetricCard;
