"""Extract final answers and allowed tool summaries from Goose stream events."""
import json


def BM_summary(BM_stdout):
    BM_messages = {}
    BM_calls = []
    BM_results = []
    BM_advertised = set()
    BM_last_assistant = None
    BM_request_messages = set()
    BM_request_names = {}
    for BM_line in BM_stdout.splitlines():
        try:
            BM_event = json.loads(BM_line)
        except ValueError:
            continue
        if not isinstance(BM_event, dict):
            continue
        BM_message = BM_event.get("message", {})
        if BM_message.get("role") == "assistant":
            BM_last_assistant = BM_message.get("id")
        BM_advertised.update(BM_message.get("metadata", {}).get("operations", {}).get("llm", {}).get("advertised_tools", []))
        for BM_block in BM_message.get("content", []):
            if BM_block.get("type") == "text" and BM_message.get("role") == "assistant":
                BM_id = BM_message["id"]
                BM_messages[BM_id] = BM_messages.get(BM_id, "") + BM_block.get("text", "")
            elif BM_block.get("type") == "toolRequest":
                BM_request_messages.add(BM_message.get("id"))
                BM_call = BM_block.get("toolCall", {})
                if BM_call.get("status") == "success":
                    BM_value = BM_call["value"]
                    BM_request_names[BM_block.get("id")] = BM_value["name"]
                    BM_calls.append({"BM_name": BM_value["name"], "BM_arguments": BM_value.get("arguments", {})})
            elif BM_block.get("type") == "toolResponse":
                BM_result = BM_block.get("toolResult", {})
                if BM_result.get("status") != "success" or BM_result.get("value", {}).get("isError"):
                    BM_results.append({"BM_status": "tool_error"})
                    continue
                if BM_request_names.get(BM_block.get("id")) == "load_skill":
                    BM_results.append({"BM_status": "skill_loaded"})
                    continue
                try:
                    BM_value = json.loads("".join(BM_part.get("text", "") for BM_part in BM_result["value"]["content"]))
                    BM_allowed = {"BM_status", "BM_fields_present", "BM_private_result_saved", "BM_scope", "BM_complete", "BM_items_read", "BM_more_loaded"}
                    if isinstance(BM_value, dict) and not set(BM_value) - BM_allowed:
                        BM_results.append(BM_value)
                    else:
                        BM_results.append({"BM_status": "unexpected_tool_result"})
                except (ValueError, KeyError, TypeError):
                    BM_results.append({"BM_status": "unexpected_tool_result"})
    BM_final = BM_messages.get(BM_last_assistant, "") if BM_last_assistant not in BM_request_messages else ""
    return {"BM_answer": BM_final, "BM_tool_calls": BM_calls,
            "BM_tool_results": BM_results, "BM_advertised_tools": sorted(BM_advertised)}
