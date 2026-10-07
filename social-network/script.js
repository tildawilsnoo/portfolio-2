(function () {
  var data = window.NETWORK_DATA;
  var ANIMATION_MS = 9000; // length of the intro playthrough, regardless of how many days there are

  var svg = d3.select('svg');
  var width = window.innerWidth, height = window.innerHeight;
  var g = svg.append('g');
  var zoom = d3.zoom().scaleExtent([0.2, 8]).on('zoom', function (event) {
    g.attr('transform', event.transform);
  });
  svg.call(zoom).on('dblclick.zoom', null);
  // The full network wants roughly 900px across — start zoomed out on
  // narrower screens (phones) so it all fits, centered.
  var startScale = Math.min(1, width / 900);
  svg.call(zoom.transform, d3.zoomIdentity
    .translate(width / 2 * (1 - startScale), height / 2 * (1 - startScale)).scale(startScale));
  svg.on('click', function (event) {
    if (event.target === svg.node()) { focusId = null; applyHighlight(); }
  });

  var nodes = data.nodes;
  var byId = new Map(nodes.map(function (d) { return [d.id, d]; }));
  var allLinks = data.links.map(function (l) { return { a: l[0], b: l[1] }; });
  var neighbors = new Map(nodes.map(function (d) { return [d.id, []]; }));
  allLinks.forEach(function (l) { neighbors.get(l.a).push(l.b); neighbors.get(l.b).push(l.a); });

  var minDate = nodes[0].dates[0];
  var maxDate = nodes.reduce(function (m, d) {
    var last = d.dates[d.dates.length - 1];
    return last > m ? last : m;
  }, minDate);
  var msPerDay = 86400000;
  function toUtcMs(iso) { return Date.parse(iso + 'T00:00:00Z'); }
  function dateAtOffset(o) { return new Date(toUtcMs(minDate) + o * msPerDay).toISOString().slice(0, 10); }
  var totalDays = Math.round((toUtcMs(maxDate) - toUtcMs(minDate)) / msPerDay);

  // --- colors + legend (click a category to hide/show it) -------------
  var counts = d3.rollup(nodes, function (v) { return v.length; }, function (d) { return d.relationship; });
  var categories = Array.from(counts.keys()).sort(function (a, b) { return counts.get(b) - counts.get(a); });
  var pinned = { friend: d3.schemeTableau10[6], professor: d3.schemeTableau10[7] };
  var auto = d3.scaleOrdinal(d3.schemeTableau10.filter(function (c) {
    return c !== pinned.friend && c !== pinned.professor;
  })).domain(categories.filter(function (c) { return !pinned[c]; }));
  function color(c) { return pinned[c] || auto(c); }
  var hidden = new Set();
  var legend = d3.select('#legend');
  categories.forEach(function (cat) {
    var row = legend.append('div').attr('title', 'Show / hide');
    row.append('span').attr('class', 'swatch').style('background', color(cat));
    row.append('span').text(cat);
    row.on('click', function () {
      if (hidden.has(cat)) hidden.delete(cat); else hidden.add(cat);
      row.classed('off', hidden.has(cat));
      render();
    });
  });

  // --- simulation -------------------------------------------------------
  var radius = function (d) { return Math.max(3, Math.sqrt(d.n) * 2.6); };
  var simulation = d3.forceSimulation()
    .alphaDecay(0.015)
    .force('link', d3.forceLink().id(function (d) { return d.id; }).strength(0.25))
    .force('charge', d3.forceManyBody().strength(-45).distanceMax(400))
    .force('collide', d3.forceCollide(function (d) { return radius(d) + 1; }))
    .force('x', d3.forceX(function () { return width / 2; }).strength(0.05 * Math.pow(height / width, 0.3)))
    .force('y', d3.forceY(function () { return height / 2; }).strength(0.05 * Math.pow(width / height, 0.3)))
    .on('tick', updatePositions);

  var linksG = g.append('g'), nodesG = g.append('g');
  var link = linksG.selectAll('line'), node = nodesG.selectAll('circle');
  var focusId = null;
  var todayIds = new Set();

  function updatePositions() {
    link.attr('x1', function (d) { return d.source.x; }).attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; }).attr('y2', function (d) { return d.target.y; });
    node.attr('cx', function (d) { return d.x; }).attr('cy', function (d) { return d.y; });
  }

  var drag = d3.drag()
    .on('start', function (event, d) { d.dragStart = [event.x, event.y]; d.dragging = false; })
    .on('drag', function (event, d) {
      if (!d.dragging) {
        if (Math.hypot(event.x - d.dragStart[0], event.y - d.dragStart[1]) < 4) return;
        d.dragging = true;
        simulation.alphaTarget(0.3).restart();
      }
      d.fx = event.x; d.fy = event.y;
    })
    .on('end', function (event, d) {
      if (d.dragging) { simulation.alphaTarget(0); d.fx = null; d.fy = null; }
      d.dragging = false;
    });

  // --- tooltip ------------------------------------------------------------
  var tooltip = document.getElementById('tooltip');
  function showTooltip(event, d) {
    var nb = neighbors.get(d.id).filter(function (id) { return visibleIds.has(id); }).length;
    tooltip.textContent = d.relationship + ' · ' + d.n + ' day' + (d.n === 1 ? '' : 's') +
      ' · knows ' + nb + ' other' + (nb === 1 ? '' : 's');
    tooltip.style.display = 'block';
    var x = event.clientX + 12, y = event.clientY + 12;
    if (x + tooltip.offsetWidth > window.innerWidth - 8) x = event.clientX - tooltip.offsetWidth - 12;
    tooltip.style.left = x + 'px'; tooltip.style.top = y + 'px';
  }
  function hideTooltip() { tooltip.style.display = 'none'; }

  // --- click a person to highlight who they know ---------------------
  function applyHighlight() {
    if (focusId === null || !visibleIds.has(focusId)) {
      focusId = null;
      node.classed('dim', false).classed('focus', false);
      link.classed('dim', false).classed('hl', false);
      return;
    }
    var keep = new Set(neighbors.get(focusId)); keep.add(focusId);
    node.classed('dim', function (d) { return !keep.has(d.id); })
        .classed('focus', function (d) { return d.id === focusId; });
    link.classed('hl', function (d) { return d.source.id === focusId || d.target.id === focusId; })
        .classed('dim', function (d) { return d.source.id !== focusId && d.target.id !== focusId; });
  }

  // --- day box --------------------------------------------------------
  // One dot per person you talked to that day (category on hover), not
  // grouped by interaction.
  var dayBox = document.getElementById('day-box');
  function renderDayBox(date, offset) {
    var entries = data.interactions_by_date[date] || [];
    var people = new Set();
    entries.forEach(function (e) { e.people.forEach(function (p) { people.add(p); }); });
    var rels = Array.from(people, function (pid) { return byId.get(pid).relationship; })
      .sort(function (a, b) { return categories.indexOf(a) - categories.indexOf(b); });

    dayBox.innerHTML = '';
    var h = document.createElement('h2');
    h.textContent = 'Day ' + (offset + 1) + ' \u00b7 ' + rels.length + ' ' + (rels.length === 1 ? 'person' : 'people');
    dayBox.appendChild(h);
    if (!rels.length) {
      var em = document.createElement('em'); em.textContent = 'nothing logged';
      dayBox.appendChild(em); return;
    }
    var dots = document.createElement('div'); dots.className = 'dots';
    rels.forEach(function (rel) {
      var sw = document.createElement('span'); sw.className = 'swatch';
      sw.style.background = color(rel);
      sw.title = rel;
      dots.appendChild(sw);
    });
    dayBox.appendChild(dots);
  }

  // --- render one day -------------------------------------------------
  var slider = document.getElementById('slider');
  var prevBtn = document.getElementById('prev'), nextBtn = document.getElementById('next');
  var playBtn = document.getElementById('play');
  slider.max = totalDays;
  var visibleIds = new Set();

  function render() {
    var offset = +slider.value;
    var date = dateAtOffset(offset);
    prevBtn.disabled = offset <= 0;
    nextBtn.disabled = offset >= totalDays;
    var visible = nodes.filter(function (d) { return d.dates[0] <= date && !hidden.has(d.relationship); });
    var added = visible.some(function (d) { return !visibleIds.has(d.id); });
    visible.forEach(function (d) {
      d.n = d3.bisectRight(d.dates, date);
      // Newcomers start next to someone they already know (or the
      // middle) so they grow out of the cluster instead of flying in.
      if (d.x === undefined) {
        var anchor = neighbors.get(d.id).map(function (id) { return byId.get(id); })
          .find(function (o) { return o.x !== undefined && visibleIds.has(o.id); });
        d.x = (anchor ? anchor.x : width / 2) + (Math.random() - .5) * 20;
        d.y = (anchor ? anchor.y : height / 2) + (Math.random() - .5) * 20;
      }
    });
    visibleIds = new Set(visible.map(function (d) { return d.id; }));
    var visibleLinks = allLinks
      .filter(function (l) { return visibleIds.has(l.a) && visibleIds.has(l.b); })
      .map(function (l) { return { source: l.a, target: l.b }; });

    var everyone = visibleIds.size, total = nodes.filter(function (d) { return d.dates[0] <= date; }).length;
    document.getElementById('stats').textContent =
      total + ' people · ' + visibleLinks.length + ' connections' + (everyone < total ? ' (' + everyone + ' shown)' : '');

    link = linksG.selectAll('line')
      .data(visibleLinks, function (d) { return d.source + '-' + d.target; })
      .join('line').attr('class', 'link');

    node = nodesG.selectAll('circle')
      .data(visible, function (d) { return d.id; })
      .join(function (enter) {
        return enter.append('circle').attr('class', 'node').attr('r', 0)
          .attr('cx', function (d) { return d.x; }).attr('cy', function (d) { return d.y; })
          .attr('fill', function (d) { return color(d.relationship); })
          .on('mousemove', showTooltip).on('mouseleave', hideTooltip)
          .on('click', function (event, d) {
            if (d.dragging) return;
            focusId = focusId === d.id ? null : d.id;
            applyHighlight();
            event.stopPropagation();
          })
          .call(drag);
      });
    node.transition().duration(playing ? 120 : 300).attr('r', radius);

    simulation.nodes(visible);
    simulation.force('link').links(visibleLinks);
    simulation.force('collide').radius(function (d) { return radius(d) + 1; });
    // Only give the layout a real shove when someone new appears;
    // otherwise just enough to absorb dots growing, so the existing
    // network stays put instead of jiggling every frame.
    simulation.alpha(Math.max(simulation.alpha(), added ? 0.3 : 0.05)).restart();
    updatePositions();
    applyHighlight();
    renderDayDetails();
  }

  // The day box and the outline on today's people only make sense when
  // you're stopped on a day — during playback they'd flicker every frame.
  function renderDayDetails() {
    var offset = +slider.value, date = dateAtOffset(offset);
    todayIds = new Set();
    if (!playing) {
      (data.interactions_by_date[date] || []).forEach(function (e) {
        e.people.forEach(function (p) { todayIds.add(p); });
      });
      renderDayBox(date, offset);
    }
    dayBox.style.display = playing ? 'none' : '';
    node.classed('today', function (d) { return todayIds.has(d.id); });
  }

  // --- playback -------------------------------------------------------
  var playing = false, timer = null;
  function setPlaying(p) {
    playing = p;
    playBtn.innerHTML = p ? '&#10074;&#10074;' : '&#9654;';
    if (timer) { timer.stop(); timer = null; }
    if (!p) { renderDayDetails(); return; }
    renderDayDetails();
    if (+slider.value >= totalDays) { slider.value = 0; render(); }
    var msPerStep = Math.max(16, ANIMATION_MS / Math.max(1, totalDays));
    var startOffset = +slider.value;
    timer = d3.timer(function (elapsed) {
      var next = Math.min(totalDays, startOffset + Math.floor(elapsed / msPerStep));
      if (next !== +slider.value) { slider.value = next; render(); }
      if (next >= totalDays) setPlaying(false);
    });
  }
  playBtn.addEventListener('click', function () { setPlaying(!playing); });

  function step(delta) {
    setPlaying(false);
    var next = Math.min(totalDays, Math.max(0, +slider.value + delta));
    if (next === +slider.value) return;
    slider.value = next; render();
  }
  prevBtn.addEventListener('click', function () { step(-1); });
  nextBtn.addEventListener('click', function () { step(1); });
  slider.addEventListener('input', function () { setPlaying(false); render(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
  });
  window.addEventListener('resize', function () {
    width = window.innerWidth; height = window.innerHeight;
    simulation.alpha(0.3).restart();
  });

  // Intro: play through every day once, then hand over to the user.
  // Skip straight to the end for people who've asked for less motion.
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    slider.value = totalDays; render(); setPlaying(false);
  } else {
    slider.value = 0; playing = true; render(); setPlaying(true);
  }
})();
