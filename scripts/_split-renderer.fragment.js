function rrSplitRender(e){
  const {
    t: n,
    months: r,
    rows: a,
    onRowClick: i,
    emptyText: s,
    totals: c,
    styles: d,
    onSort: m
  } = e;

  const g = A.useMemo(
    () => ["n", "tenant", "contract", "area", "indicator", ...r.flatMap((y) => ["m" + y + "c", "m" + y + "p"]), "debt"],
    [r]
  );

  const [b, w] = A.useState(() => {
    try {
      const y = localStorage.getItem("rr-split-cols-v7");
      if (y) return JSON.parse(y);
    } catch {}
    return {};
  });

  const [x, v] = A.useState(() => {
    try {
      const y = Number(localStorage.getItem("rr-split-row-h"));
      if (y >= 22 && y <= 64) return y;
    } catch {}
    return 28;
  });

  const dragRef = A.useRef(null);
  const [guideX, setGuideX] = A.useState(null);

  const k = A.useCallback(() => {
    const y = x;
    return (h) => {
      h.preventDefault();
      h.stopPropagation();
      const j = h.clientY;
      const E = (P) => {
        v(Math.max(22, Math.min(56, y + (P.clientY - j))));
      };
      const P = () => {
        document.removeEventListener("mousemove", E);
        document.removeEventListener("mouseup", P);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        v((O) => {
          try {
            localStorage.setItem("rr-split-row-h", String(O));
          } catch {}
          return O;
        });
      };
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", E);
      document.addEventListener("mouseup", P);
    };
  }, [x]);

  const j = (y) => {
    const h = Number(y);
    return Number.isFinite(h) ? h.toFixed(2) : "0.00";
  };

  const totalArea = A.useMemo(
    () => Math.round(a.reduce((y, h) => y + Number(h.area || 0), 0) * 100) / 100,
    [a]
  );
  const totalDebt = A.useMemo(
    () => Math.round(a.reduce((y, h) => y + Number(h.debt || 0), 0) * 100) / 100,
    [a]
  );

  const O = { n: 44, tenant: 190, contract: 140, area: 96, indicator: 78, debt: 104 };
  const T = (y) => b[y] ?? (String(y).startsWith("m") ? 72 : O[y] ?? 80);
  const tableWidth = g.reduce((sum, key) => sum + T(key), 0);
  const M = r.length ? 5 + r.length * 2 + 1 : 6;

  const cls = (...parts) => parts.filter(Boolean).join(" ");

  const S = (key) => (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    const startX = evt.clientX;
    const startW = T(key);
    dragRef.current = { key, startX, startW };
    setGuideX(startX);

    const onMove = (ev) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = Math.max(16, Math.round(drag.startW + (ev.clientX - drag.startX)));
      setGuideX(ev.clientX);
      w((prev) => {
        // Lock every column to an explicit px width so the browser cannot
        // redistribute space into neighbours while one column is resized.
        const locked = {};
        for (const colKey of g) locked[colKey] = prev[colKey] ?? (String(colKey).startsWith("m") ? 72 : O[colKey] ?? 80);
        if (locked[drag.key] === next) return prev;
        locked[drag.key] = next;
        return locked;
      });
    };

    const onUp = () => {
      dragRef.current = null;
      setGuideX(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      w((prev) => {
        try {
          localStorage.setItem("rr-split-cols-v7", JSON.stringify(prev));
        } catch {}
        return prev;
      });
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const th = (key, className, label, align) =>
    u.jsxs("th", {
      rowSpan: 2,
      className: cls(className, d.thResizable),
      style: {
        width: T(key),
        position: "relative",
        textAlign: align || "left",
      },
      children: [
        u.jsx("button", {
          type: "button",
          className: d.splitSortBtn,
          onClick: () => m && m(key),
          children: label,
        }),
        u.jsx("span", {
          className: d.colResizeHandle,
          role: "separator",
          "aria-orientation": "vertical",
          onMouseDown: S(key),
        }),
      ],
    });

  const summaryRows =
    a.length > 0
      ? [
          u.jsxs("tr", {
            key: "sum-rent",
            className: d.totalRow,
            children: [
              u.jsx("td", { rowSpan: 2, className: d.numCol }),
              u.jsx("td", {
                rowSpan: 2,
                className: d.totalLabel,
                children: n("rentRegister.totalRow"),
              }),
              u.jsx("td", { rowSpan: 2, className: d.contractCell, children: "\u00a0" }),
              u.jsxs("td", {
                rowSpan: 2,
                className: d.numCell,
                title: n("rentRegister.colArea"),
                children: [
                  totalArea.toLocaleString("ru-RU", { maximumFractionDigits: 2 }),
                  " ",
                  n("common.sqm"),
                ],
              }),
              u.jsx("td", { className: d.indicatorCell, children: n("rentRegister.indicatorRent") }),
              r.map((y) => {
                var h;
                return u.jsxs(
                  A.Fragment,
                  {
                    children: [
                      u.jsx("td", {
                        className: d.numCell,
                        children: j((h = c.monthTotals[y]) == null ? void 0 : h.rent),
                      }),
                      u.jsx("td", {
                        className: d.numCell,
                        children: j((h = c.monthTotals[y]) == null ? void 0 : h.paid),
                      }),
                    ],
                  },
                  "tr-" + y
                );
              }),
              u.jsx("td", {
                rowSpan: 2,
                className: cls(d.numCell, d.debtCell),
                title: n("common.debt"),
                children: j(totalDebt),
              }),
            ],
          }),
          u.jsxs("tr", {
            key: "sum-util",
            className: d.totalRow,
            children: [
              u.jsx("td", {
                className: d.indicatorCell,
                children: n("rentRegister.indicatorUtil"),
              }),
              r.map((y) => {
                var h;
                return u.jsxs(
                  A.Fragment,
                  {
                    children: [
                      u.jsx("td", {
                        className: d.numCell,
                        children: j((h = c.monthTotals[y]) == null ? void 0 : h.utility),
                      }),
                      u.jsx("td", {
                        className: d.numCell,
                        children: j((h = c.monthTotals[y]) == null ? void 0 : h.utilityPaid),
                      }),
                    ],
                  },
                  "tu-" + y
                );
              }),
            ],
          }),
        ]
      : [];

  return u.jsxs("div", {
    className: d.splitWrap,
    children: [
      guideX == null
        ? null
        : u.jsx("div", {
            style: {
              position: "fixed",
              top: 0,
              bottom: 0,
              left: guideX,
              width: 2,
              marginLeft: -1,
              background: "var(--color-blue, #1267e8)",
              zIndex: 10000,
              pointerEvents: "none",
            },
          }),
      u.jsxs("table", {
        className: cls(d.splitTable, d.splitTableFixed),
        style: {
          "--rr-row-h": x + "px",
          width: tableWidth,
          minWidth: tableWidth,
          maxWidth: tableWidth,
        },
        children: [
          u.jsx("colgroup", {
            children: g.map((y) =>
              u.jsx(
                "col",
                {
                  width: T(y),
                  style: { width: T(y) + "px", minWidth: T(y) + "px", maxWidth: T(y) + "px" },
                },
                y
              )
            ),
          }),
          u.jsxs("thead", {
            children: [
              u.jsxs("tr", {
                children: [
                  th("n", d.numCol, "№", "center"),
                  th("tenant", null, n("rentRegister.colTenant")),
                  th("contract", null, n("rentRegister.colContract")),
                  th("area", d.numCell, n("rentRegister.colArea"), "right"),
                  u.jsxs("th", {
                    rowSpan: 2,
                    className: cls(d.indicatorCol, d.thResizable),
                    style: {
                      width: T("indicator"),
                      position: "relative",
                    },
                    children: [
                      n("rentRegister.colIndicator"),
                      u.jsx("span", {
                        className: d.colResizeHandle,
                        role: "separator",
                        "aria-orientation": "vertical",
                        onMouseDown: S("indicator"),
                      }),
                    ],
                  }),
                  r.map((y) =>
                    u.jsxs(
                      "th",
                      {
                        colSpan: 2,
                        className: d.monthGroup,
                        style: { position: "relative" },
                        children: [
                          or(n, y),
                          u.jsx("span", {
                            className: d.colResizeHandle,
                            role: "separator",
                            "aria-orientation": "vertical",
                            onMouseDown: S("m" + y + "p"),
                          }),
                        ],
                      },
                      y
                    )
                  ),
                  th("debt", d.numCell, n("common.debt"), "right"),
                ],
              }),
              u.jsx("tr", {
                children: r.map((y) =>
                  u.jsxs(
                    A.Fragment,
                    {
                      children: [
                        u.jsxs("th", {
                          className: cls(d.subCol, d.thResizable),
                          style: {
                            width: T("m" + y + "c"),
                            position: "relative",
                          },
                          children: [
                            u.jsx("button", {
                              type: "button",
                              className: d.splitSortBtn,
                              onClick: () => m && m("r" + y),
                              children: n("rentRegister.chargedShort"),
                            }),
                            u.jsx("span", {
                              className: d.colResizeHandle,
                              role: "separator",
                              "aria-orientation": "vertical",
                              onMouseDown: S("m" + y + "c"),
                            }),
                          ],
                        }),
                        u.jsxs("th", {
                          className: cls(d.subCol, d.thResizable),
                          style: {
                            width: T("m" + y + "p"),
                            position: "relative",
                          },
                          children: [
                            u.jsx("button", {
                              type: "button",
                              className: d.splitSortBtn,
                              onClick: () => m && m("pd" + y),
                              children: n("rentRegister.paidShort"),
                            }),
                            u.jsx("span", {
                              className: d.colResizeHandle,
                              role: "separator",
                              "aria-orientation": "vertical",
                              onMouseDown: S("m" + y + "p"),
                            }),
                          ],
                        }),
                      ],
                    },
                    y
                  )
                ),
              }),
            ],
          }),
          u.jsx("tbody", {
            children:
              a.length === 0
                ? u.jsx("tr", { children: u.jsx("td", { colSpan: M, className: d.emptyCell, children: s }) })
                : [
                    ...summaryRows,
                    ...a.map((y, h) => {
                      return u.jsxs(
                        A.Fragment,
                        {
                          children: [
                            u.jsxs("tr", {
                              className: cls(d.splitRow, h % 2 ? d.splitPairAlt : ""),
                              onClick: () => i(y),
                              children: [
                                u.jsx("td", { rowSpan: 2, className: d.numCol, children: y.rowNum }),
                                u.jsx("td", {
                                  rowSpan: 2,
                                  className: d.tenantCell,
                                  title: y.tenantName,
                                  children: y.tenantName,
                                }),
                                u.jsx("td", {
                                  rowSpan: 2,
                                  className: d.contractCell,
                                  title: y.contractLabel || "",
                                  children: y.contractLabel || "—",
                                }),
                                u.jsxs("td", {
                                  rowSpan: 2,
                                  className: d.numCell,
                                  children: [
                                    Number(y.area || 0).toLocaleString("ru-RU", {
                                      maximumFractionDigits: 2,
                                    }),
                                    " ",
                                    n("common.sqm"),
                                  ],
                                }),
                                u.jsx("td", {
                                  className: d.indicatorCell,
                                  children: n("rentRegister.indicatorRent"),
                                }),
                                r.map((z) => {
                                  var L;
                                  return u.jsxs(
                                    A.Fragment,
                                    {
                                      children: [
                                        u.jsx("td", {
                                          className: d.numCell,
                                          children: j((L = y.months[z]) == null ? void 0 : L.rent),
                                        }),
                                        u.jsx("td", {
                                          className: d.numCell,
                                          children: j((L = y.months[z]) == null ? void 0 : L.paid),
                                        }),
                                      ],
                                    },
                                    "r" + y.rowNum + "-" + z
                                  );
                                }),
                                u.jsx("td", {
                                  rowSpan: 2,
                                  className: cls(d.numCell, d.debtCell),
                                  children: j(y.debt),
                                }),
                              ],
                            }),
                            u.jsxs("tr", {
                              className: cls(d.splitRow, d.splitRowAlt, h % 2 ? d.splitPairAlt : ""),
                              onClick: () => i(y),
                              children: [
                                u.jsx("td", {
                                  className: d.indicatorCell,
                                  children: n("rentRegister.indicatorUtil"),
                                }),
                                r.map((z) => {
                                  var L;
                                  return u.jsxs(
                                    A.Fragment,
                                    {
                                      children: [
                                        u.jsx("td", {
                                          className: d.numCell,
                                          children: j(
                                            (L = y.months[z]) == null ? void 0 : L.utility
                                          ),
                                        }),
                                        u.jsx("td", {
                                          className: d.numCell,
                                          children: j(
                                            (L = y.months[z]) == null ? void 0 : L.utilityPaid
                                          ),
                                        }),
                                      ],
                                    },
                                    "u" + y.rowNum + "-" + z
                                  );
                                }),
                              ],
                            }),
                          ],
                        },
                        y.rowNum
                      );
                    }),
                  ],
          }),
        ],
      }),
      u.jsx("div", {
        className: d.rowResizeBar,
        onMouseDown: k(),
        title: n("rentRegister.resizeRows"),
      }),
    ],
  });
}
