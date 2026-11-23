import { Field, TextField } from "@decky/ui";
import { useRef, useState } from "react";
import { searchHltbGames, type HltbSearchResult } from "../backend";
import { formatHours, translateBackendError, useT } from "../i18n";
import {
  editorFocusTargetClassName,
  editorSearchButtonStyle,
  editorSearchRowStyle,
  editorSearchInputStyle,
} from "../metadataEditorStyles";
import { fieldStyle, FocusableButton } from "../styles";

type Props = {
  initialQuery: string;
  disabled: boolean;
  onApply: (picked: { id: number; name: string }) => Promise<void>;
};

/** Search HowLongToBeat by name and pick the game whose times this game shows. */
export function HltbGameSearch({ initialQuery, disabled, onApply }: Props) {
  const t = useT();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<HltbSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  // Only the latest search may show its results.
  const requestRef = useRef(0);

  const search = async () => {
    const request = ++requestRef.current;
    setSearching(true);
    setError("");
    try {
      const found = await searchHltbGames(query);
      if (request === requestRef.current) setResults(found);
    } catch (searchError) {
      if (request === requestRef.current) {
        setResults(null);
        setError(translateBackendError(searchError));
      }
    } finally {
      if (request === requestRef.current) setSearching(false);
    }
  };

  return (
    <>
      <Field label={t("editor.ign.gameName")} childrenLayout="below" childrenContainerWidth="max" bottomSeparator="standard">
      <div style={editorSearchRowStyle}>
        <div style={editorSearchInputStyle}>
          <TextField
            className={editorFocusTargetClassName}
            aria-label={t("editor.hltbSearchTitle")}
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            style={{ ...fieldStyle, width: "100%" }}
          />
        </div>
        <FocusableButton
          className={`DialogButton ${editorFocusTargetClassName}`}
          disabled={disabled || searching || !query.trim()}
          onClick={() => void search()}
          style={editorSearchButtonStyle}
        >
          {searching ? t("hltb.search.searching") : t("hltb.search.action")}
        </FocusableButton>
      </div>
      </Field>
        {error ? (
          <Field focusable={false} description={<span aria-live="polite">{error}</span>} bottomSeparator="none" />
        ) : null}
        {!searching && results?.length === 0 ? (
          <Field focusable={false} description={t("hltb.search.noGames")} bottomSeparator="none" />
        ) : null}
        {results?.map((result) => (
          <Field
            key={result.game_id}
            className={`decky-metadata-editor__result ${editorFocusTargetClassName}`}
            label={result.game_name}
            description={
              result.main_seconds > 0
                ? t("hltb.search.mainStory", { hours: formatHours(result.main_seconds / 3600) })
                : t("hltb.search.noMainStory")
            }
            focusable={true}
            highlightOnFocus={true}
            bottomSeparator="standard"
            disabled={disabled}
            onActivate={() => void onApply({ id: result.game_id, name: result.game_name })}
            onClick={() => void onApply({ id: result.game_id, name: result.game_name })}
          />
        ))}
    </>
  );
}
