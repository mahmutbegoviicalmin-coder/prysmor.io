"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { track } from "@/lib/track";

export interface FAQItem {
  q: string;
  a: string;
}

interface FAQProps {
  title?: string;
  items: FAQItem[];
}

const GREEN = "#39FF6A";

function AccordionItem({
  item,
  index,
  isOpen,
  onToggle,
}: {
  item: FAQItem;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const answerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(0);

  useEffect(() => {
    if (answerRef.current) {
      setHeight(isOpen ? answerRef.current.scrollHeight : 0);
    }
  }, [isOpen]);

  return (
    <div
      style={{
        borderBottom: "1px solid #111",
        borderTop: index === 0 ? "1px solid #111" : "none",
      }}
    >
      {/* Question row */}
      <button
        onClick={onToggle}
        className="w-full text-left"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "22px 0",
          cursor: "pointer",
          background: "none",
          border: "none",
          width: "100%",
        }}
      >
        <span
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: isOpen ? "white" : "#ccc",
            letterSpacing: "-0.3px",
            lineHeight: 1.4,
            transition: "color 200ms",
            textAlign: "left",
          }}
        >
          {item.q}
        </span>
        <span
          style={{
            fontSize: "20px",
            fontWeight: 300,
            color: isOpen ? GREEN : "#333",
            flexShrink: 0,
            marginLeft: "24px",
            lineHeight: 1,
            transition: "color 200ms",
            userSelect: "none",
          }}
        >
          {isOpen ? "−" : "+"}
        </span>
      </button>

      {/* Answer, animated height */}
      <div
        style={{
          height: `${height}px`,
          overflow: "hidden",
          transition: "height 250ms ease",
        }}
      >
        <div ref={answerRef} style={{ paddingBottom: "22px" }}>
          <p
            style={{
              fontSize: "14px",
              color: "#555",
              fontWeight: 300,
              lineHeight: 1.75,
              maxWidth: "640px",
              margin: 0,
            }}
          >
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ({ items }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number>(0);

  return (
    <section
      id="faq"
      style={{
        background: "#080808",
        padding: "100px 40px",
        borderTop: "1px solid #0f0f0f",
      }}
    >
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>

        {/* Header */}
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          style={{ marginBottom: "64px" }}
        >
          <p style={{
            fontSize: "11px",
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            color: "rgba(255,255,255,0.4)",
            marginBottom: "16px",
          }}>
            FAQ
          </p>
          <h2 style={{
            fontSize: "clamp(28px, 3.5vw, 40px)",
            fontWeight: 600,
            color: "white",
            letterSpacing: "-1px",
            lineHeight: 1.1,
            margin: 0,
          }}>
            Questions, answered.
          </h2>
        </motion.div>

        {/* Accordion */}
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {items.map((item, i) => (
            <AccordionItem
              key={i}
              item={item}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => {
                const next = openIndex === i ? -1 : i;
                if (next !== -1) {
                  track("faq_open", { index: i, question: item.q.slice(0, 80) });
                }
                setOpenIndex(next);
              }}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
