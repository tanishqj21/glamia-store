import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { formatIST, productUrl } from "../lib/commerce";

function starText(value) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  return `${"★".repeat(Math.round(rating))}${"☆".repeat(5 - Math.round(rating))}`;
}

function reviewDate(value) {
  return value ? formatIST(value, { dateStyle: "medium" }) : "Recently";
}

function ReviewStars({ value, onChange }) {
  if (!onChange) return <span className="review-stars" aria-label={`${Number(value || 0).toFixed(1)} out of 5 stars`}>{starText(value)}</span>;
  return <div className="review-star-picker" role="group" aria-label="Choose a rating">{[1, 2, 3, 4, 5].map((star) => <button type="button" key={star} className={star <= value ? "selected" : ""} aria-label={`${star} star${star === 1 ? "" : "s"}`} aria-pressed={star === value} onClick={() => onChange(star)}>★</button>)}</div>;
}

function reviewState(product) {
  return {
    reviews: product.reviews || [],
    average: product.review_average ?? product.rating ?? 0,
    count: product.review_count ?? (product.reviews || []).length,
    my_review: product.my_review || null,
  };
}

export function ProductReviews({ product, user, onNavigate, onReviewsUpdated }) {
  const [data, setData] = useState(() => reviewState(product));
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setData(reviewState(product));
  }, [product]);

  useEffect(() => {
    setRating(Number(data.my_review?.rating) || 5);
    setComment(data.my_review?.comment || "");
  }, [data.my_review?.id, product.id]);

  function applyReviewData(next) {
    setData(next);
    onReviewsUpdated?.(next);
  }

  async function loadReviews() {
    const response = await apiFetch(`/api/products/${encodeURIComponent(product.id)}/reviews`);
    const next = await response.json();
    if (!response.ok) throw new Error(next.error || "Reviews could not be loaded");
    applyReviewData(next);
  }

  async function saveReview(event) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const response = await apiFetch(`/api/products/${encodeURIComponent(product.id)}/reviews`, { method: "POST", body: JSON.stringify({ rating, comment }) });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Review could not be saved");
      applyReviewData(next);
      setStatus("Your review is live.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeReview() {
    if (!window.confirm("Remove your review from this product?")) return;
    setBusy(true);
    setStatus("");
    try {
      const response = await apiFetch(`/api/products/${encodeURIComponent(product.id)}/reviews`, { method: "DELETE" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Review could not be removed");
      applyReviewData(next);
      setStatus("Your review was removed.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  const average = Number(data.average || 0);
  return <section className="product-reviews" aria-labelledby="product-reviews-title">
    <div className="product-reviews-heading">
      <div><p className="eyebrow">Community notes</p><h2 id="product-reviews-title">Reviews & ratings</h2></div>
      <div className="review-summary"><strong>{average ? average.toFixed(1) : "—"}</strong><ReviewStars value={average} /><span>{data.count || 0} review{data.count === 1 ? "" : "s"}</span></div>
    </div>
    <div className="review-layout">
      <div className="review-list">
        {data.reviews.length ? data.reviews.map((review) => <article className="review-card" key={review.id}>
          <div className="review-card-heading"><div><strong>{review.user_name || "Glamia member"}</strong>{review.verified ? <span className="review-verified">Verified purchase</span> : null}</div><time dateTime={review.created_at || undefined}>{reviewDate(review.created_at)}</time></div>
          <ReviewStars value={review.rating} />
          <p>{review.comment}</p>
        </article>) : <div className="empty-state review-empty">No reviews yet. Be the first to share how this piece feels.</div>}
      </div>
      <aside className="review-form-card">
        <p className="eyebrow">Your experience</p>
        <h3>{data.my_review ? "Update your review" : "Leave a review"}</h3>
        {user ? <form className="review-form" onSubmit={saveReview}><label>Rating<ReviewStars value={rating} onChange={setRating} /></label><label>Review<textarea rows="5" minLength="3" maxLength="500" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="What should another shopper know?" required /></label><button className="primary-action" type="submit" disabled={busy}>{busy ? "Saving…" : data.my_review ? "Update review" : "Post review"} <span aria-hidden="true">↗</span></button>{data.my_review && <button type="button" className="text-link review-delete" onClick={removeReview} disabled={busy}>Remove my review</button>}</form> : <><p className="muted">Sign in to share your rating. Purchased reviews receive a verified badge.</p><button type="button" className="secondary-action" onClick={() => onNavigate("/login")}>Sign in to review</button></>}
        {status && <p className="inline-note" role="status">{status}</p>}
      </aside>
    </div>
    <button type="button" className="text-link review-refresh" onClick={() => loadReviews().catch((error) => setStatus(error.message))}>Refresh reviews</button>
  </section>;
}

export function MyReviewsPanel({ onNavigate }) {
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    apiFetch("/api/my/reviews")
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!response.ok) throw new Error(data.error || "Your reviews could not be loaded");
        setReviews(data.reviews || []);
      })
      .catch((error) => setStatus(error.message));
  }, []);

  return <section className="account-panel" aria-labelledby="my-reviews-title">
    <div className="account-panel-heading"><div><p className="eyebrow">Your voice</p><h2 id="my-reviews-title">Your reviews</h2></div><span className="account-badge">{reviews.length} posted</span></div>
    {status && <p className="inline-error" role="alert">{status}</p>}
    {reviews.length ? <div className="my-review-list">{reviews.map((review) => <article className="my-review-card" key={review.id}><div className="review-card-heading"><div><strong>{review.product_name || "Product"}</strong>{review.verified ? <span className="review-verified">Verified purchase</span> : null}</div><time>{reviewDate(review.created_at)}</time></div><button type="button" className="review-product-link" onClick={() => onNavigate(productUrl({ id: review.product_id, name: review.product_name }))}><ReviewStars value={review.rating} /><span>View product ↗</span></button><p>{review.comment}</p><span className={`status-pill status-${review.status || "visible"}`}>{review.status || "visible"}</span></article>)}</div> : !status && <div className="empty-state">You have not posted a review yet. Your thoughts help the next shopper.</div>}
  </section>;
}
