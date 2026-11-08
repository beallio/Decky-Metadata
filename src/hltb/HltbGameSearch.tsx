import { PanelSectionRow, TextField } from "@decky/ui";
import { useRef, useState } from "react";
import { searchHltbGames, type HltbSearchResult } from "../backend";
import {
  editorFocusTargetClassName,
  editorSearchButtonStyle,
  editorSearchInputRowSpacingStyle,
  editorSearchResultsSpacingStyle,
  editorSearchRowStyle,
} from "../metadataEditorStyles";
import { t } from "../i18n";
import { compactTextStyle, fieldStyle, FocusableButton, rowStackStyle } from "../styles";

type Props = {
  initialQuery: string;
  disabled: boolean;
  onApply: (picked: { id: number; name: string }) => Promise<void>;
};

/** Search HowLongToBeat by name and pick the game whose times this game shows. */
export function HltbGameSearch({ initialQuery, disabled, onApply }: Props) {
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
        setError(String(searchError));
      }
    } finally {
      if (request === requestRef.current) setSearching(false);
    }
  };

  return (
    <>
      <PanelSectionRow>
        <div style={{ ...editorSearchRowStyle, ...editorSearchInputRowSpacingStyle }}>
          <TextField
            className={editorFocusTargetClassName}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={fieldStyle}
          />
          <FocusableButton
            className={`DialogButton ${editorFocusTargetClassName}`}
            disabled={disabled || searching || !query.trim()}
            onClick={() => void search()}
            style={editorSearchButtonStyle}
          >
            {searching ? t("common.searching") : t("hltbSearch.search")}
          </FocusableButton>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ ...rowStackStyle, ...editorSearchResultsSpacingStyle }}>
          {error ? <div style={compactTextStyle}>{error}</div> : null}
          {!searching && results?.length === 0 ? <div style={compactTextStyle}>{t("hltbSearch.empty")}</div> : null}
          {results?.map((result) => (
            <FocusableButton
              key={result.game_id}
              className={`DialogButton ${editorFocusTargetClassName} decky-metadata-editor__result`}
              disabled={disabled}
              onClick={() => void onApply({ id: result.game_id, name: result.game_name })}
              style={{ justifyContent: "flex-start", textAlign: "left" }}
            >
              <div style={rowStackStyle}>
                <b>{result.game_name}</b>
                <span style={compactTextStyle}>
                  {result.main_seconds > 0
                    ? t("hltbSearch.mainStory", { hours: (result.main_seconds / 3600).toFixed(1) })
                    : t("hltbSearch.noMainStory")}
                </span>
              </div>
            </FocusableButton>
          ))}
        </div>
      </PanelSectionRow>
    </>
  );
}
