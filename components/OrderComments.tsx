"use client";

import { useState } from "react";
import { ConfirmButton } from "./ConfirmButton";

type Comment = {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export function OrderComments({
  orderId,
  orderNumber,
  comments,
  isAdmin,
  addAction,
  deleteAction,
}: {
  orderId: string;
  orderNumber: string;
  comments: Comment[];
  isAdmin: boolean;
  addAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          comments.length > 0
            ? `${comments.length} تعليق — دوس للعرض`
            : "إضافة تعليق"
        }
        className="relative rounded-lg bg-gray-100 p-1.5 text-gray-600 hover:bg-gray-200"
        aria-label="تعليقات الأوردر"
      >
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M2 10c0-3.9 3.6-7 8-7s8 3.1 8 7-3.6 7-8 7c-.9 0-1.8-.1-2.6-.4L4 18l.8-3C3.1 13.7 2 12 2 10z"
            clipRule="evenodd"
          />
        </svg>
        {comments.length > 0 && (
          <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500"></span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                تعليقات أوردر {orderNumber}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>

            <div className="mb-4 max-h-64 space-y-3 overflow-y-auto">
              {comments.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">
                  لسه مفيش تعليقات على الأوردر ده
                </p>
              ) : (
                comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-900">
                        {comment.author_name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {new Date(comment.created_at).toLocaleDateString(
                            "ar-EG",
                            {
                              day: "numeric",
                              month: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                        {isAdmin && (
                          <form action={deleteAction}>
                            <input
                              type="hidden"
                              name="comment_id"
                              value={comment.id}
                            />
                            <ConfirmButton
                              message="متأكد إنك عايز تمسح التعليق ده؟"
                              className="text-xs text-red-500 hover:text-red-700"
                            >
                              مسح
                            </ConfirmButton>
                          </form>
                        )}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-gray-700">
                      {comment.body}
                    </p>
                  </div>
                ))
              )}
            </div>

            <form action={addAction} className="flex items-end gap-2">
              <input type="hidden" name="order_id" value={orderId} />
              <textarea
                name="body"
                required
                rows={2}
                placeholder="اكتب تعليقك..."
                className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
              ></textarea>
              <button
                type="submit"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
              >
                إضافة
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
