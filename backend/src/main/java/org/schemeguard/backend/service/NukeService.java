package org.schemeguard.backend.service;

import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Service
public class NukeService {

    private static final String SCRIPT_PATH = "db/utils/Nuke.sql";

    private final JdbcTemplate jdbcTemplate;
    private final TransactionTemplate transactionTemplate;

    public NukeService(
            JdbcTemplate jdbcTemplate,
            PlatformTransactionManager transactionManager
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public void executeNuke() {
        List<String> statements = splitStatements(readScript()).stream()
                .filter(statement -> !isScriptTransactionControl(statement))
                .toList();

        if (statements.isEmpty()) {
            throw new IllegalStateException("Nuke SQL script contains no statements");
        }

        transactionTemplate.executeWithoutResult(status ->
                statements.forEach(jdbcTemplate::execute)
        );
    }

    private String readScript() {
        try (var input = new ClassPathResource(SCRIPT_PATH).getInputStream()) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new IllegalStateException("Could not load " + SCRIPT_PATH, exception);
        }
    }

    private List<String> splitStatements(String script) {
        List<String> statements = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        String dollarQuote = null;
        boolean singleQuote = false;
        boolean doubleQuote = false;
        boolean lineComment = false;
        boolean blockComment = false;

        for (int index = 0; index < script.length(); index++) {
            char character = script.charAt(index);
            char next = index + 1 < script.length() ? script.charAt(index + 1) : '\0';

            if (lineComment) {
                current.append(character);
                if (character == '\n') lineComment = false;
                continue;
            }

            if (blockComment) {
                current.append(character);
                if (character == '*' && next == '/') {
                    current.append(next);
                    index++;
                    blockComment = false;
                }
                continue;
            }

            if (dollarQuote != null) {
                if (script.startsWith(dollarQuote, index)) {
                    current.append(dollarQuote);
                    index += dollarQuote.length() - 1;
                    dollarQuote = null;
                } else {
                    current.append(character);
                }
                continue;
            }

            if (singleQuote) {
                current.append(character);
                if (character == '\'' && next == '\'') {
                    current.append(next);
                    index++;
                } else if (character == '\'') {
                    singleQuote = false;
                }
                continue;
            }

            if (doubleQuote) {
                current.append(character);
                if (character == '"' && next == '"') {
                    current.append(next);
                    index++;
                } else if (character == '"') {
                    doubleQuote = false;
                }
                continue;
            }

            if (character == '-' && next == '-') {
                current.append(character).append(next);
                index++;
                lineComment = true;
            } else if (character == '/' && next == '*') {
                current.append(character).append(next);
                index++;
                blockComment = true;
            } else if (character == '\'') {
                current.append(character);
                singleQuote = true;
            } else if (character == '"') {
                current.append(character);
                doubleQuote = true;
            } else if (character == '$' && (dollarQuote = findDollarQuote(script, index)) != null) {
                current.append(dollarQuote);
                index += dollarQuote.length() - 1;
            } else if (character == ';') {
                addStatement(statements, current);
            } else {
                current.append(character);
            }
        }

        addStatement(statements, current);
        return statements;
    }

    private String findDollarQuote(String script, int start) {
        int closingDelimiter = script.indexOf('$', start + 1);
        if (closingDelimiter < 0) return null;

        String tag = script.substring(start + 1, closingDelimiter);
        if (tag.isEmpty() || tag.matches("[A-Za-z_][A-Za-z0-9_]*")) {
            return script.substring(start, closingDelimiter + 1);
        }
        return null;
    }

    private void addStatement(List<String> statements, StringBuilder current) {
        String statement = current.toString().trim();
        if (!statement.isEmpty()) statements.add(statement);
        current.setLength(0);
    }

    private boolean isScriptTransactionControl(String statement) {
        String withoutLeadingComments = statement.replaceAll("(?m)^\\s*--[^\\r\\n]*(?:\\r?\\n|$)", "").trim();
        return withoutLeadingComments.equalsIgnoreCase("BEGIN")
                || withoutLeadingComments.equalsIgnoreCase("COMMIT");
    }
}
