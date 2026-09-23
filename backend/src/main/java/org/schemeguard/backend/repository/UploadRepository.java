package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.Upload;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UploadRepository extends JpaRepository<Upload, UUID> {

    @Query(value = """
        SELECT u.id AS id,
           s.original_file_name AS fileName,
           u.uploaded_at AS uploadedAt,
           s.status AS importStatus,
                   COUNT(t.id) AS transactionCount,
                   SUM(CASE WHEN t.status = 'NEW' THEN 1 ELSE 0 END) AS newTransactionCount
        FROM uploads u
        JOIN upload_sessions s ON s.id = u.session_id
        LEFT JOIN transactions t ON t.upload_id = u.id
        WHERE u.user_id = :userId
        GROUP BY u.id, s.original_file_name, u.uploaded_at, s.status
        ORDER BY u.uploaded_at DESC, u.id DESC
        """,
        countQuery = """
            SELECT COUNT(u.id)
            FROM uploads u
            WHERE u.user_id = :userId
            """,
        nativeQuery = true)
    Page<UploadSummaryProjection> findSummariesByUserId(
        @Param("userId") UUID userId,
        Pageable pageable
    );

    Optional<Upload> findBySession_Id(UUID sessionId);

    @Query("select u.id from Upload u where u.session.id = :sessionId")
    Optional<UUID> findUploadIdBySessionId(@Param("sessionId") UUID sessionId);
}
