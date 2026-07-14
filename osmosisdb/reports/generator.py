"""LLM-based human-readable explanation generator using LangChain + Groq."""

from __future__ import annotations

import logging
from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq

logger = logging.getLogger(__name__)


def generate_optimization_report(
    opt_type: str,
    ddl: str,
    explanation_context: str,
    groq_api_key: str = "",
    model_name: str = "llama-3.3-70b-versatile",
) -> str:
    """Generate a clean, plain-English report explaining the optimization plan.

    Falls back to a structural template if Groq API key is missing or calls fail.
    """
    fallback_report = (
        f"Optimization Plan ({opt_type}):\n"
        f"DDL Statement: {ddl}\n\n"
        f"Rationale: {explanation_context}\n"
        f"Risk analysis: Standard operation. CREATE INDEX CONCURRENTLY runs without locking "
        f"table reads/writes. CLUSTER or DROP INDEX may hold table locks."
    )

    if not groq_api_key:
        logger.debug("No Groq API key configured. Using template fallback for explanation.")
        return fallback_report

    try:
        chat = ChatGroq(
            temperature=0.1,
            model_name=model_name,
            api_key=groq_api_key,
        )

        prompt = ChatPromptTemplate.from_messages([
            (
                "system",
                "You are an expert database administrator. Summarize the following PostgreSQL optimization plan. "
                "Explain in plain English what it does, why it is needed based on the workload context, "
                "any performance trade-offs, and estimated risks. Keep it professional, structured, and under 250 words.",
            ),
            (
                "human",
                "Optimization Type: {opt_type}\nDDL: {ddl}\nWorkload Context: {context}",
            ),
        ])

        chain = prompt | chat
        response = chain.invoke({
            "opt_type": opt_type,
            "ddl": ddl,
            "context": explanation_context,
        })
        return str(response.content)

    except Exception as e:
        logger.warning("LLM report generation failed: %s. Using template fallback.", e)
        return fallback_report
