package org.schemeguard.backend.repository;

import org.schemeguard.backend.entity.Upload;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface UploadRepository extends JpaRepository<Upload, UUID> {

    Optional<Upload> findBySession_Id(UUID sessionId);

    @Query("select u.id from Upload u where u.session.id = :sessionId")
    Optional<UUID> findUploadIdBySessionId(@Param("sessionId") UUID sessionId);
}
