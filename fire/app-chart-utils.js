function renderXYChart(svg, seriesList, options) {
  const root = d3.select(svg);
  root.selectAll("*").remove();

  const width = svg.viewBox.baseVal.width;
  const height = svg.viewBox.baseVal.height;
  const margin = options.compact
    ? { top: 18, right: 16, bottom: 42, left: 64 }
    : { top: 22, right: 24, bottom: 48, left: 84 };

  let maxX = 0;
  let minY = 0;
  let maxY = 0;

  for (const series of seriesList) {
    for (const point of series.points) {
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const xDomainMax = maxX === 0 ? 1 : maxX;
  const xScale = makeAxisScale([0, xDomainMax], [margin.left, width - margin.right], options.xSymlog);
  const yDomainMax = maxY === minY ? maxY + 1 : maxY;
  const yScale = makeAxisScale([minY, yDomainMax], [height - margin.bottom, margin.top], options.ySymlog);
  const xTicks = getAxisTickValues(xScale, 0, xDomainMax, options.compact ? 4 : 5, options.compact ? 54 : 64);
  const yTicks = getAxisTickValues(yScale, minY, yDomainMax, options.compact ? 4 : 5, options.compact ? 26 : 32);
  const line = d3.line()
    .x(point => xScale(point.x))
    .y(point => yScale(point.y));

  root.append("g")
    .selectAll("line")
    .data(yTicks)
    .join("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", tick => yScale(tick))
    .attr("y2", tick => yScale(tick))
    .attr("class", "grid-line");

  root.append("g")
    .selectAll("line")
    .data(xTicks)
    .join("line")
    .attr("x1", tick => xScale(tick))
    .attr("x2", tick => xScale(tick))
    .attr("y1", margin.top)
    .attr("y2", height - margin.bottom)
    .attr("class", "grid-line");

  root.append("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", yScale(0))
    .attr("y2", yScale(0))
    .attr("stroke", "var(--muted)");

  root.append("g")
    .attr("class", "axis axis-x")
    .attr("transform", `translate(0, ${height - margin.bottom})`)
    .call(d3.axisBottom(xScale)
      .tickValues(xTicks)
      .tickFormat(options.xAxisFormatter)
      .tickSizeOuter(0));

  root.append("g")
    .attr("class", "axis axis-y")
    .attr("transform", `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(yScale)
      .tickValues(yTicks)
      .tickFormat(options.yAxisFormatter)
      .tickSizeOuter(0));

  root.append("g")
    .selectAll("path")
    .data(seriesList)
    .join("path")
    .attr("d", series => line(series.points))
    .attr("fill", "none")
    .attr("stroke", (_series, index) => COLORS[index % COLORS.length])
    .attr("stroke-width", options.compact ? "1.8" : "2.5")
    .append("title")
    .text(series => series.name);

  addChartText(svg, margin.left, height - 8, options.xLabel, "start");
  addChartText(svg, margin.left, margin.top - 8, options.yLabel, "start");

  if (options.interactive) {
    bindXYChartHover(svg, seriesList, {
      ...options,
      width,
      height,
      margin,
      maxX,
      minY,
      maxY,
      plotWidth,
      plotHeight,
      xScale,
      yScale
    });
  }
}


function bindXYChartHover(svg, seriesList, chart) {
  const root = d3.select(svg);
  const overlay = root.append("rect")
    .attr("x", chart.margin.left)
    .attr("y", chart.margin.top)
    .attr("width", chart.plotWidth)
    .attr("height", chart.plotHeight)
    .attr("fill", "transparent")
    .style("cursor", "crosshair");
  const group = root.append("g")
    .attr("class", "xy-hover-layer")
    .style("display", "none");
  const line = group.append("line")
    .attr("y1", chart.margin.top)
    .attr("y2", chart.height - chart.margin.bottom)
    .attr("class", "xy-hover-line");
  const pointsGroup = group.append("g");
  const box = group.append("rect")
    .attr("class", "xy-hover-box")
    .attr("rx", "8");
  const textGroup = group.append("g");

  const getXValueFromEvent = event => {
    const point = d3.pointer(event, svg);
    const pointerX = point[0];
    const xCoord = clamp(pointerX, chart.margin.left, chart.width - chart.margin.right);
    return chart.xScale.invert(xCoord);
  };

  overlay.on("mousemove", event => {
    const point = d3.pointer(event, svg);
    const pointerY = point[1];
    const xValue = getXValueFromEvent(event);
    const values = seriesList
      .map((series, seriesIndex) => ({ name: series.name, seriesIndex, y: interpolateSeriesAtX(series.points, xValue) }));
    const x = chart.xScale(xValue);

    group.style("display", "");
    line.attr("x1", x).attr("x2", x);
    pointsGroup.selectAll("*").remove();
    textGroup.selectAll("*").remove();

    const sortedValues = [...values].sort((a, b) => b.y - a.y);
    const shownValues = sortedValues.slice(0, chart.maxHoverSeries);
    const lines = [
      `${chart.xLabel}: ${chart.xFormatter(xValue)}`,
      ...shownValues.map(item => `${item.name}: ${chart.yFormatter(item.y)}`)
    ];

    if (sortedValues.length > shownValues.length) {
      lines.push(`+${sortedValues.length - shownValues.length} more`);
    }

    pointsGroup.selectAll("circle")
      .data(shownValues)
      .join("circle")
      .attr("cx", x)
      .attr("cy", item => chart.yScale(item.y))
      .attr("r", (_item, index) => index === 0 ? 4 : 3)
      .attr("class", "xy-hover-point")
      .attr("stroke", item => COLORS[item.seriesIndex % COLORS.length]);

    const lineHeight = 18;
    const labelWidth = Math.min(chart.compact ? 280 : 320, Math.max(190, ...lines.map(lineText => lineText.length * 7.2 + 24)));
    const labelHeight = 20 + lines.length * lineHeight;
    const labelX = x + labelWidth + 12 > chart.width - chart.margin.right
      ? x - labelWidth - 12
      : x + 12;
    const labelY = clamp(pointerY - labelHeight / 2, chart.margin.top, chart.height - chart.margin.bottom - labelHeight);

    box.attr("x", labelX)
      .attr("y", labelY)
      .attr("width", labelWidth)
      .attr("height", labelHeight);

    textGroup.selectAll("text")
      .data(lines)
      .join("text")
      .attr("x", labelX + 10)
      .attr("y", (_lineText, index) => labelY + 20 + index * lineHeight)
      .attr("class", "xy-hover-label")
      .text(lineText => lineText);
  });

  overlay.on("click", event => {
    chart.onClickX(getXValueFromEvent(event));
  });

  overlay.on("mouseleave", () => {
    group.style("display", "none");
  });
}


function makeAxisScale(domain, range, useSymlog) {
  const scale = useSymlog
    ? d3.scaleSymlog().constant(1)
    : d3.scaleLinear();
  return scale.domain(domain).range(range);
}


function getAxisTickValues(scale, min, max, count, minPixelSpacing) {
  const generated = scale.ticks(count);
  const values = [min, ...generated, max]
    .filter(value => value >= min && value <= max)
    .map(value => Number(value.toPrecision(12)))
    .sort((a, b) => a - b);
  const uniqueValues = [...new Set(values)];
  const roundedMin = Number(min.toPrecision(12));
  const roundedMax = Number(max.toPrecision(12));
  const spacedValues = [];

  for (const value of uniqueValues) {
    const previous = spacedValues[spacedValues.length - 1];
    if (previous === undefined) {
      spacedValues.push(value);
      continue;
    }

    const isEndpoint = value === roundedMin || value === roundedMax;
    const isPreviousEndpoint = previous === roundedMin || previous === roundedMax;
    const tooClose = Math.abs(scale(value) - scale(previous)) < minPixelSpacing;

    if (!tooClose) {
      spacedValues.push(value);
    } else if (isEndpoint && !isPreviousEndpoint) {
      spacedValues[spacedValues.length - 1] = value;
    }
  }

  return spacedValues;
}


function interpolateSeriesAtX(points, x) {
  if (x <= points[0].x) return points[0].y;

  const last = points[points.length - 1];
  if (x >= last.x) return last.y;

  const rightIndex = d3.bisector(point => point.x).left(points, x);
  const right = points[rightIndex];
  const left = points[rightIndex - 1];
  if (right.x === left.x) return right.y;
  const t = (x - left.x) / (right.x - left.x);
  return left.y + t * (right.y - left.y);
}


function getXAtY(points, targetY) {
  for (let index = 1; index < points.length; index++) {
    const left = points[index - 1];
    const right = points[index];
    const minY = Math.min(left.y, right.y);
    const maxY = Math.max(left.y, right.y);

    if (targetY >= minY && targetY <= maxY) {
      if (right.y === left.y) return left.x;
      const t = (targetY - left.y) / (right.y - left.y);
      return left.x + t * (right.x - left.x);
    }
  }
}


function addChartText(svg, x, y, text, anchor) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
  node.setAttribute("x", x);
  node.setAttribute("y", y);
  node.setAttribute("text-anchor", anchor);
  node.setAttribute("class", "axis-label");
  node.textContent = text;
  svg.appendChild(node);
}
