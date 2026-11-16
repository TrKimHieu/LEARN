import { Module } from '@nestjs/common';
import { S3Service } from './common/s3';
import { RedisPublisher } from './common/redis';
import { DocumentExtractProcessor } from './processors/document-extract.processor';
import { LessonGenerateProcessor } from './processors/lesson-generate.processor';
import { FlashcardGenerateProcessor } from './processors/flashcard-generate.processor';

@Module({
  providers: [
    S3Service,
    RedisPublisher,
    DocumentExtractProcessor,
    LessonGenerateProcessor,
    FlashcardGenerateProcessor,
  ],
})
export class WorkerModule {}
