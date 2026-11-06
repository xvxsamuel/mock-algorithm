import { yourPart } from "../algorithm/market";
import type { FeedController } from "../hooks/useFeed";
import "./MarketLens.css";

/** The auction bars run from nothing to this many € per 1,000 views. */
const SCALE = 12;
/** Sold things shown as tiles; older ones fold into "+N". */
const TILES = 14;

type MarketLensProps = { feed: FeedController };

/**
 * Who pays for your attention: what you have been sold for so far, and the
 * auction for your next ad, where everything the app guessed about you
 * raises your price.
 */
function MarketLens({ feed }: MarketLensProps) {
  const { market, currentItem } = feed;
  const { sales, stage, auction } = market;
  const shown = sales.slice(-TILES);
  const earlier = sales.length - shown.length;

  return (
    <div className="lens">
      <section className="pane mkt-sold">
        <div className="pane-head">
          <h2 className="eyebrow">You, sold so far</h2>
          <p className="mkt-note">simulated prices</p>
        </div>
        <div className="mkt-sold-body">
          <p className="mkt-earned">€{market.earned.toFixed(4)}</p>
          <div className="mkt-sales-wrap">
            <ol className="mkt-sales" data-link="sold">
              {earlier > 0 && <li className="mkt-earlier">+{earlier}</li>}
              {shown.map((sale) => (
                <li
                  key={sale.key}
                  className={[
                    "mkt-sale",
                    `is-${sale.kind}`,
                    sale.key === currentItem.key ? "is-now" : "",
                  ].join(" ")}
                  title={
                    sale.kind === "ad"
                      ? `Ad: ${sale.brand} paid €${sale.price.toFixed(4)}`
                      : `Paid by ${sale.brand}, with no label`
                  }
                >
                  {sale.emoji}
                </li>
              ))}
              {sales.length === 0 && (
                <li className="mkt-sale is-empty" aria-label="Nothing yet" />
              )}
            </ol>
            <p className="mkt-key">
              <span className="mkt-key-item is-ad">ad</span>
              <span className="mkt-key-item is-paid">paid, no label</span>
            </p>
          </div>
        </div>
      </section>

      <section className="pane mkt-auction">
        <div className="pane-head">
          <h2 className="eyebrow">The auction for your next ad</h2>
          <p className={stage === "open" ? "mkt-stage" : "mkt-stage is-sold"}>
            {stage === "open"
              ? `in ${market.swipesToAd} ${market.swipesToAd === 1 ? "swipe" : "swipes"}`
              : stage === "next"
                ? "sold · plays next"
                : "playing now"}
          </p>
        </div>
        <ol key={auction.slot} className="mkt-bids" data-link="auction">
          {auction.bids.map((bid, i) => {
            const won = i === 0 && stage !== "open";
            const classes = ["mkt-bid"];
            if (i === 0) classes.push(won ? "is-won" : "is-lead");
            return (
              <li key={bid.advertiser.id} className={classes.join(" ")}>
                <span className="mkt-brand">
                  <span className="mkt-logo" aria-hidden="true">
                    {bid.advertiser.emoji}
                  </span>
                  {bid.advertiser.brand}
                </span>
                <span className="mkt-track">
                  <span
                    className="mkt-anyone"
                    style={{ width: `${share(bid.anyone)}%` }}
                  />
                  <span
                    className="mkt-you"
                    style={{
                      left: `${share(bid.anyone)}%`,
                      width: `${share(yourPart(bid))}%`,
                    }}
                  />
                </span>
                <span className="mkt-price">€{bid.total.toFixed(2)}</span>
                {(won || bid.because.length > 0) && (
                  <span className="mkt-because">
                    {won && <span className="mkt-chip is-sold">sold</span>}
                    {bid.because.map((reason) => (
                      <span key={reason} className="mkt-chip">
                        {reason}
                      </span>
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mkt-key is-bars">
          <span className="mkt-key-item is-anyone">for anyone</span>
          <span className="mkt-key-item is-you">
            for what it knows about you
          </span>
          <span className="mkt-per">€ per 1,000 views</span>
        </p>
      </section>
    </div>
  );
}

/** A price as a share of the bar. */
function share(euros: number): number {
  return (Math.min(euros, SCALE) / SCALE) * 100;
}

export default MarketLens;
